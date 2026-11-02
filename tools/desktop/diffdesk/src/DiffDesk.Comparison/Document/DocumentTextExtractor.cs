using DiffDesk.Domain;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;

namespace DiffDesk.Comparison.Document;

public sealed class DocumentTextExtractor : IDocumentTextService
{
    public ExtractedDocument Extract(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        try
        {
            return extension switch
            {
                ".pdf" => ExtractPdf(path),
                ".docx" => ExtractDocx(path),
                _ => new ExtractedDocument(extension, [], "PDF and DOCX text can be compared. This file type is not extracted, and nothing in the document is executed.")
            };
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidDataException)
        {
            return new ExtractedDocument(extension, [], ex.Message);
        }
    }

    private static ExtractedDocument ExtractPdf(string path)
    {
        using var document = PdfDocument.Open(path);
        var pages = new List<DocumentPage>();
        foreach (var page in document.GetPages())
            pages.Add(new DocumentPage(page.Number, page.Text ?? ""));
        var empty = pages.Count == 0 || pages.All(static page => string.IsNullOrWhiteSpace(page.Text));
        var warning = empty
            ? "No text was extracted. OCR is not available, so a scanned page stays empty. This is extracted text, not a visual comparison."
            : "Extracted text with page numbers. This is not a visual page comparison.";
        return new ExtractedDocument("pdf", pages, warning);
    }

    private static ExtractedDocument ExtractDocx(string path)
    {
        using var document = WordprocessingDocument.Open(path, false);
        var body = document.MainDocumentPart?.Document?.Body;
        var pages = new List<DocumentPage>();
        var number = 1;
        if (body is not null)
        {
            foreach (var paragraph in body.Elements<Paragraph>())
            {
                var text = paragraph.InnerText ?? "";
                pages.Add(new DocumentPage(number++, text));
            }
        }

        return new ExtractedDocument("docx", pages, "Paragraph text only. Page numbers are not available for DOCX, and this is not a visual comparison. Macros are not run.");
    }
}
