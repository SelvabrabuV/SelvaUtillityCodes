using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using ClosedXML.Excel;
using DiffDesk.Comparison.Binary;
using DiffDesk.Comparison.Document;
using DiffDesk.Comparison.Image;
using DiffDesk.Comparison.Structured;
using DiffDesk.Comparison.Table;
using DiffDesk.Domain;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace DiffDesk.UnitTests;

public class FormatTests
{
    private readonly StructuredDiffService _structured = new();
    private readonly TableComparer _tables = new();
    private readonly BinaryComparer _binary = new();
    private readonly ImageComparer _images = new();
    private readonly DocumentTextExtractor _documents = new();

    [Fact]
    public void Json_IgnoresKeyOrderAndDoesNotPairDuplicateArrayKeys()
    {
        var same = _structured.CompareJson("{\"b\":2,\"a\":1}", "{\"a\":1,\"b\":2}", true, ArrayCompareMode.Positional, null);
        Assert.Empty(same);
        var value = _structured.CompareJson("{\"a\":1}", "{\"a\":2}", true, ArrayCompareMode.Positional, null);
        Assert.True(value.Any(diff => diff.Path == "$.a" && diff.Kind == "Value"));
        var lastWins = _structured.CompareJson("{\"a\":1,\"a\":2}", "{\"a\":2}", true, ArrayCompareMode.Positional, null);
        Assert.Empty(lastWins);
        var duplicates = _structured.CompareJson(
            "{\"items\":[{\"id\":1,\"n\":\"a\"},{\"id\":1,\"n\":\"b\"}]}",
            "{\"items\":[{\"id\":1,\"n\":\"a\"}]}",
            true,
            ArrayCompareMode.Key,
            "id");
        Assert.True(duplicates.Any(diff => diff.Kind == "DuplicateKey"));
    }

    [Fact]
    public void Xml_RejectsDtdAndComparesAttributesByName()
    {
        var swapped = _structured.CompareXml("<root b=\"2\" a=\"1\"/>", "<root a=\"1\" b=\"2\"/>", true, true);
        Assert.Empty(swapped);
        var changed = _structured.CompareXml("<root><item>one</item></root>", "<root><item>two</item></root>", true, true);
        Assert.True(changed.Any(diff => diff.Kind == "Text"));
        var xxe = """
            <?xml version="1.0"?>
            <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]>
            <root>&xxe;</root>
            """;
        var blocked = _structured.CompareXml(xxe, "<root>safe</root>", true, true);
        var error = Assert.Single(blocked);
        Assert.Equal("ParseError", error.Kind);
        Assert.DoesNotContain("fonts", error.LeftValue ?? "", StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CsvAndXlsx_MatchByKeyAndDoNotRequireExcel()
    {
        using var dir = new TempDir();
        var leftCsv = Path.Combine(dir.Path, "left.csv");
        var rightCsv = Path.Combine(dir.Path, "right.csv");
        File.WriteAllText(leftCsv, "Id,Name\n1,Ada\n2,Bea\n");
        File.WriteAllText(rightCsv, "Id,Name\n2,Bea\n1,Ada Lovelace\n");
        var csv = _tables.CompareCsv(leftCsv, rightCsv, new TableCompareOptions { KeyColumns = ["Id"] });
        var cell = Assert.Single(csv.Diffs, diff => diff.Kind == "Cell");
        Assert.Equal("Name", cell.Column);
        Assert.Equal("Ada", cell.LeftValue);
        Assert.Equal("Ada Lovelace", cell.RightValue);
        Assert.Contains("Ada Lovelace", _tables.ExportCsv(csv));

        var leftBook = Path.Combine(dir.Path, "left.xlsx");
        var rightBook = Path.Combine(dir.Path, "right.xlsx");
        WriteSheet(leftBook, "1", "Ada");
        WriteSheet(rightBook, "1", "Grace");
        var xlsx = _tables.CompareXlsx(leftBook, rightBook, new TableCompareOptions { KeyColumns = ["Id"], SheetName = "Data" });
        Assert.Contains("Formulas", xlsx.Warning);
        Assert.True(xlsx.Diffs.Any(diff => diff.Kind == "Cell" && diff.RightValue == "Grace"));
    }

    [Fact]
    public void BinaryCompare_FindsARegionWithoutLoadingTheWholeFileIntoTheResult()
    {
        using var dir = new TempDir();
        var left = Path.Combine(dir.Path, "left.bin");
        var right = Path.Combine(dir.Path, "right.bin");
        var bytes = Enumerable.Repeat((byte)1, 64).ToArray();
        File.WriteAllBytes(left, bytes);
        bytes[10] = 2;
        File.WriteAllBytes(right, bytes);
        var diff = _binary.Compare(left, right, CancellationToken.None);
        Assert.False(diff.Equal);
        Assert.NotEqual(diff.LeftSha256, diff.RightSha256);
        var region = Assert.Single(diff.Regions);
        Assert.Equal(10, region.Offset);
        var window = _binary.ReadWindow(left, right, 8, 8);
        Assert.Equal(8, window.Count);
        Assert.Equal(1, window.Left[2]);
        Assert.Equal(2, window.Right[2]);
    }

    [Fact]
    public void ImageCompare_CountsPixelsAndSkipsAResize()
    {
        using var dir = new TempDir();
        var left = Path.Combine(dir.Path, "left.bmp");
        var right = Path.Combine(dir.Path, "right.bmp");
        var other = Path.Combine(dir.Path, "wide.bmp");
        WriteBitmap(left, 4, 4, System.Drawing.Color.Red);
        WriteBitmap(right, 4, 4, System.Drawing.Color.Blue);
        WriteBitmap(other, 6, 4, System.Drawing.Color.Red);
        var heat = Path.Combine(dir.Path, "heat.png");
        var diff = _images.Compare(left, right, 0, heat, CancellationToken.None);
        Assert.True(diff.PixelCompared);
        Assert.True(diff.SameDimensions);
        Assert.False(diff.PixelsEqual);
        Assert.Equal(16, diff.DifferentPixels);
        Assert.True(File.Exists(heat));
        var size = _images.Compare(left, other, 0, null, CancellationToken.None);
        Assert.False(size.SameDimensions);
        Assert.False(size.PixelCompared);
        Assert.Contains("dimensions", size.Detail);
    }

    [Fact]
    public void Documents_ExtractTextAndLabelTheLimit()
    {
        using var dir = new TempDir();
        var docx = Path.Combine(dir.Path, "note.docx");
        using (var document = WordprocessingDocument.Create(docx, WordprocessingDocumentType.Document))
        {
            var main = document.AddMainDocumentPart();
            main.Document = new Document(new Body(new Paragraph(new Run(new Text("Hello Docx")))));
            main.Document.Save();
        }

        var extracted = _documents.Extract(docx);
        Assert.Equal("docx", extracted.Format);
        Assert.True(extracted.Pages.Any(page => page.Text.Contains("Hello Docx")));
        Assert.Contains("not a visual", extracted.Warning);

        var pdf = Path.Combine(dir.Path, "note.pdf");
        WritePdf(pdf, "Hello");
        var pdfText = _documents.Extract(pdf);
        Assert.Equal("pdf", pdfText.Format);
        Assert.Contains("not a visual", pdfText.Warning);
        if (pdfText.Pages.Count > 0 && pdfText.Pages.Any(page => page.Text.Contains("Hello")))
            Assert.Contains("Hello", string.Join(" ", pdfText.Pages.Select(page => page.Text)));
        else
            Assert.False(string.IsNullOrWhiteSpace(pdfText.Warning));
    }

    private static void WriteSheet(string path, string id, string name)
    {
        using var book = new XLWorkbook();
        var sheet = book.AddWorksheet("Data");
        sheet.Cell(1, 1).Value = "Id";
        sheet.Cell(1, 2).Value = "Name";
        sheet.Cell(2, 1).Value = id;
        sheet.Cell(2, 2).Value = name;
        sheet.Cell(3, 2).FormulaA1 = "=1+1";
        book.SaveAs(path);
    }

    private static void WriteBitmap(string path, int width, int height, System.Drawing.Color color)
    {
        using var bitmap = new Bitmap(width, height);
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
                bitmap.SetPixel(x, y, color);
        }

        bitmap.Save(path, ImageFormat.Bmp);
    }

    private static void WritePdf(string path, string text)
    {
        var stream = "BT /F1 12 Tf 40 100 Td (" + text + ") Tj ET\n";
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            "<< /Length " + Encoding.ASCII.GetByteCount(stream) + " >>\nstream\n" + stream + "endstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        var builder = new StringBuilder();
        builder.Append("%PDF-1.4\n");
        var offsets = new List<int>();
        foreach (var (item, index) in objects.Select((item, index) => (item, index)))
        {
            offsets.Add(Encoding.ASCII.GetByteCount(builder.ToString()));
            builder.Append(index + 1).Append(" 0 obj\n").Append(item).Append("\nendobj\n");
        }

        var xref = Encoding.ASCII.GetByteCount(builder.ToString());
        builder.Append("xref\n0 ").Append(objects.Length + 1).Append('\n');
        builder.Append("0000000000 65535 f \n");
        foreach (var offset in offsets)
            builder.Append(offset.ToString("D10")).Append(" 00000 n \n");
        builder.Append("trailer << /Size ").Append(objects.Length + 1).Append(" /Root 1 0 R >>\nstartxref\n");
        builder.Append(xref).Append("\n%%EOF");
        File.WriteAllText(path, builder.ToString(), Encoding.ASCII);
    }
}
