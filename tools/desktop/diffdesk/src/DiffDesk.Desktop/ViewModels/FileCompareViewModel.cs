using System.Collections.ObjectModel;
using Avalonia.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Comparison.Text;
using DiffDesk.Desktop.Services;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public partial class FileCompareViewModel : WorkspaceTab, ISessionTab, ICompareTab, ISaveTab
{
    private readonly ITableComparisonService _tables = AppHost.Get<ITableComparisonService>();
    private readonly IImageComparisonService _images = AppHost.Get<IImageComparisonService>();
    private readonly IBinaryComparisonService _binary = AppHost.Get<IBinaryComparisonService>();
    private readonly IStructuredDiffService _structured = AppHost.Get<IStructuredDiffService>();
    private readonly IDocumentTextService _documents = AppHost.Get<IDocumentTextService>();
    private readonly ITextDiffService _text = AppHost.Get<ITextDiffService>();
    private readonly IComparisonReportService _reports = AppHost.Get<IComparisonReportService>();
    private TableComparison? _table;

    public FileCompareViewModel(string kind)
        : base(TitleFor(kind), true)
    {
        Kind = kind;
        ShowTable = kind == "table";
        ShowImage = kind == "image";
        ShowBinary = kind == "binary";
        ShowStructured = kind is "json" or "xml";
        ShowDocument = kind == "document";
    }

    public string Kind { get; }
    public ObservableCollection<TableDiff> TableDiffs { get; } = [];
    public ObservableCollection<StructuredDiff> StructuredDiffs { get; } = [];
    public ObservableCollection<BinaryRegion> Regions { get; } = [];
    public ObservableCollection<HunkRow> Hunks { get; } = [];

    [ObservableProperty] private string _leftPath = "";
    [ObservableProperty] private string _rightPath = "";
    [ObservableProperty] private string _status = "";
    [ObservableProperty] private string _banner = "";
    [ObservableProperty] private string _keyColumns = "";
    [ObservableProperty] private bool _ignoreRowOrder;
    [ObservableProperty] private string _leftHex = "";
    [ObservableProperty] private string _rightHex = "";
    [ObservableProperty] private string _offsetText = "0";
    [ObservableProperty] private string _rendered = "";
    [ObservableProperty] private bool _showTable;
    [ObservableProperty] private bool _showImage;
    [ObservableProperty] private bool _showBinary;
    [ObservableProperty] private bool _showStructured;
    [ObservableProperty] private bool _showDocument;
    [ObservableProperty] private Bitmap? _leftImage;
    [ObservableProperty] private Bitmap? _rightImage;
    [ObservableProperty] private Bitmap? _heatmap;

    public Task CompareAsync() => Compare();

    [RelayCommand]
    private async Task BrowseLeftAsync()
    {
        var path = await Dialogs.Current.PickOpenFileAsync("Left file");
        if (!string.IsNullOrWhiteSpace(path))
            LeftPath = path;
    }

    [RelayCommand]
    private async Task BrowseRightAsync()
    {
        var path = await Dialogs.Current.PickOpenFileAsync("Right file");
        if (!string.IsNullOrWhiteSpace(path))
            RightPath = path;
    }

    [RelayCommand]
    private async Task Compare()
    {
        if (string.IsNullOrWhiteSpace(LeftPath) || string.IsNullOrWhiteSpace(RightPath))
        {
            Status = "Choose the left file and the right file.";
            return;
        }

        try
        {
            if (ShowTable)
                await CompareTable();
            else if (ShowImage)
                CompareImage();
            else if (ShowBinary)
                CompareBinary();
            else if (ShowStructured)
                CompareStructured();
            else
                CompareDocument();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException or ArgumentException)
        {
            Status = ex.Message;
        }
    }

    [RelayCommand]
    private async Task ExportAsync()
    {
        if (_table is null)
        {
            Status = "Compare the tables before exporting.";
            return;
        }

        var path = await Dialogs.Current.PickSaveFileAsync("Export table diff", "csv");
        if (string.IsNullOrWhiteSpace(path))
            return;
        _reports.Write(path, _tables.ExportCsv(_table));
        Status = "Saved " + path;
    }

    [RelayCommand]
    private void LoadWindow()
    {
        if (!long.TryParse(OffsetText, out var offset))
        {
            Status = "The offset needs to be a number of bytes.";
            return;
        }

        var window = _binary.ReadWindow(LeftPath, RightPath, offset, 256);
        LeftHex = Hex(window.Left);
        RightHex = Hex(window.Right);
        Status = "Showing " + window.Count + " bytes from offset " + window.Offset + ".";
    }

    public Task SaveAsync() => ExportAsync();

    public SessionRecord ToSession() => new()
    {
        Id = SessionId,
        Name = Title,
        ComparisonType = Kind,
        LeftPath = LeftPath,
        RightPath = RightPath,
        LastOpened = DateTimeOffset.Now
    };

    public Task LoadAsync(SessionRecord session)
    {
        SessionId = session.Id;
        LeftPath = session.LeftPath ?? "";
        RightPath = session.RightPath ?? "";
        return Compare();
    }

    partial void OnLeftImageChanging(Bitmap? value) => ReplaceImage(_leftImage, value);
    partial void OnRightImageChanging(Bitmap? value) => ReplaceImage(_rightImage, value);
    partial void OnHeatmapChanging(Bitmap? value) => ReplaceImage(_heatmap, value);

    private async Task CompareTable()
    {
        var options = new TableCompareOptions
        {
            KeyColumns = KeyColumns.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries).Select(static column => column.Trim()).ToList(),
            IgnoreRowOrder = IgnoreRowOrder
        };
        _table = LeftPath.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase) || RightPath.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)
            ? await Task.Run(() => _tables.CompareXlsx(LeftPath, RightPath, options))
            : _tables.CompareCsv(LeftPath, RightPath, options);
        TableDiffs.Clear();
        foreach (var diff in _table.Diffs)
            TableDiffs.Add(diff);
        Banner = _table.Warning ?? "";
        Status = _table.Diffs.Count + " table difference(s). Formulas and macros are not executed.";
    }

    private void CompareImage()
    {
        var heatPath = Path.Combine(Path.GetTempPath(), "diffdesk-heat-" + Guid.NewGuid().ToString("N") + ".png");
        var result = _images.Compare(LeftPath, RightPath, 0, heatPath, CancellationToken.None);
        LeftImage = LoadBitmap(LeftPath);
        RightImage = LoadBitmap(RightPath);
        Heatmap = result.HeatmapPngPath is not null && File.Exists(result.HeatmapPngPath) ? LoadBitmap(result.HeatmapPngPath) : null;
        Banner = result.Detail ?? "";
        Status = result.PixelCompared
            ? result.DifferentPixels + " of " + result.TotalPixels + " pixels differ (" + result.DifferencePercent.ToString("0.###") + "%)."
            : Banner;
    }

    private void CompareBinary()
    {
        var result = _binary.Compare(LeftPath, RightPath, CancellationToken.None);
        Regions.Clear();
        foreach (var region in result.Regions)
            Regions.Add(region);
        Status = (result.Equal ? "The files match. " : "The files differ. ")
            + result.DifferentBytes + " different byte(s). "
            + (result.RegionsTruncated ? "Only the first 5000 regions are listed. " : "")
            + "SHA-256 " + result.LeftSha256 + " / " + result.RightSha256;
        LoadWindow();
    }

    private void CompareStructured()
    {
        var left = File.ReadAllText(LeftPath);
        var right = File.ReadAllText(RightPath);
        var diffs = Kind == "xml"
            ? _structured.CompareXml(left, right, true, true)
            : _structured.CompareJson(left, right, true, ArrayCompareMode.Positional, null);
        StructuredDiffs.Clear();
        foreach (var diff in diffs)
            StructuredDiffs.Add(diff);
        Banner = Kind == "xml"
            ? "External XML entities are rejected. This is a structure comparison."
            : "Object key order is ignored. Duplicate object keys keep the last value. Duplicate array keys are not paired.";
        Status = diffs.Count + " difference(s).";
    }

    private void CompareDocument()
    {
        var left = _documents.Extract(LeftPath);
        var right = _documents.Extract(RightPath);
        var leftText = Join(left);
        var rightText = Join(right);
        var diff = _text.Compare(leftText, rightText, TextCompareOptions.Default);
        Hunks.Clear();
        foreach (var hunk in diff.Hunks)
        {
            Hunks.Add(new HunkRow(hunk.Id, hunk.LeftStart + 1, hunk.LeftCount, hunk.RightStart + 1, hunk.RightCount, Preview(hunk.LeftLines), Preview(hunk.RightLines), hunk));
        }

        Rendered = left.Warning + " " + right.Warning;
        Banner = "Extracted text only. This is not a visual page comparison, and OCR is not available.";
        Status = diff.Identical ? "The extracted text matches." : diff.Hunks.Count + " text change(s).";
    }

    private static string Join(ExtractedDocument document) =>
        string.Join("\n", document.Pages.Select(page => "--- page " + page.Number + " ---\n" + page.Text));

    private static string Preview(IReadOnlyList<string> lines) => lines.Count == 0 ? "" : lines[0];

    private static Bitmap? LoadBitmap(string path)
    {
        try
        {
            return new Bitmap(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return null;
        }
    }

    private static void ReplaceImage(Bitmap? previous, Bitmap? next)
    {
        if (previous is not null && !ReferenceEquals(previous, next))
            previous.Dispose();
    }

    private static string Hex(byte[] data)
    {
        var builder = new System.Text.StringBuilder();
        for (var i = 0; i < data.Length; i++)
        {
            if (i > 0 && i % 16 == 0)
                builder.AppendLine();
            builder.Append(data[i].ToString("X2")).Append(' ');
        }

        return builder.ToString();
    }

    private static string TitleFor(string kind) => kind switch
    {
        "image" => "Images",
        "table" => "Tables",
        "binary" => "Binary",
        "json" => "JSON",
        "xml" => "XML",
        "document" => "Documents",
        _ => "Files"
    };
}
