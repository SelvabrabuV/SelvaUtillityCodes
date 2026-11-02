namespace DiffDesk.Domain;

public enum CompareStatus
{
    Identical,
    Different,
    LeftOnly,
    RightOnly,
    LeftNewer,
    RightNewer,
    Unreadable,
    Pending,
    Error
}

public enum EntryKind
{
    File,
    Directory,
    ReparsePoint
}

public enum SyncMode
{
    MirrorLeftToRight,
    MirrorRightToLeft,
    UpdateRightFromLeft,
    UpdateLeftFromRight,
    TwoWay,
    Custom
}

public enum SyncAction
{
    Copy,
    Update,
    Delete,
    Skip,
    Conflict
}

public enum SyncDirection
{
    None,
    LeftToRight,
    RightToLeft
}

public enum ReportFormat
{
    Text,
    Json,
    Csv,
    Html
}

public enum ArrayCompareMode
{
    Positional,
    Key
}

public enum LineChange
{
    Same,
    Removed,
    Added,
    Modified
}

public enum MergePieceKind
{
    Unchanged,
    LeftOnly,
    RightOnly,
    Both,
    Conflict
}

public enum MergeResolution
{
    Left,
    Right,
    Both
}

public sealed record TextCompareOptions
{
    public bool IgnoreCase { get; init; }
    public bool IgnoreLeadingTrailingWhitespace { get; init; }
    public bool IgnoreWhitespace { get; init; }
    public bool IgnoreBlankLines { get; init; }
    public bool NormalizeLineEndings { get; init; } = true;

    public static TextCompareOptions Default { get; } = new();
}

public sealed record ComparisonRules
{
    public bool CompareSize { get; init; } = true;
    public bool CompareTimestamp { get; init; } = true;
    public TimeSpan TimestampTolerance { get; init; } = TimeSpan.FromSeconds(2);
    public bool CompareContent { get; init; }
    public bool CompareHash { get; init; }
    public bool TextAware { get; init; }
    public bool CaseSensitiveNames { get; init; }
    public bool FollowReparsePoints { get; init; }
    public TextCompareOptions Text { get; init; } = TextCompareOptions.Default;
    public int MaxDegreeOfParallelism { get; init; } = Math.Max(1, Environment.ProcessorCount);

    public static ComparisonRules Quick { get; } = new();
    public static ComparisonRules WithContent { get; } = new() { CompareContent = true };
}

public sealed record FilterRules
{
    public List<string> IncludeExtensions { get; init; } = [];
    public List<string> ExcludeExtensions { get; init; } = [];
    public List<string> IncludeGlobs { get; init; } = [];
    public List<string> ExcludeGlobs { get; init; } = [];
    public bool ExcludeHidden { get; init; }
    public bool ExcludeSystem { get; init; }
    public long? MinBytes { get; init; }
    public long? MaxBytes { get; init; }
    public DateTimeOffset? ModifiedAfter { get; init; }
    public DateTimeOffset? ModifiedBefore { get; init; }
    public bool DifferencesOnly { get; init; }
    public bool LeftOnly { get; init; }
    public bool RightOnly { get; init; }
    public List<string> AlwaysIncludeRelativePaths { get; init; } = [];

    public static FilterRules Default { get; } = new();

    public static IReadOnlyList<string> CommonBuildExcludes { get; } =
    [
        "**/.git/**",
        "**/bin/**",
        "**/obj/**",
        "**/node_modules/**",
        "**/.vs/**"
    ];
}

public sealed record FolderEntry
{
    public required string RelativePath { get; init; }
    public required EntryKind Kind { get; init; }
    public CompareStatus Status { get; init; }
    public string? Detail { get; init; }
    public long? LeftLength { get; init; }
    public long? RightLength { get; init; }
    public DateTimeOffset? LeftModified { get; init; }
    public DateTimeOffset? RightModified { get; init; }
    public string? LeftHash { get; init; }
    public string? RightHash { get; init; }
    public bool ContentEqual { get; init; }
    public bool ContentChecked { get; init; }

    public string Name => RelativePath.Length == 0
        ? RelativePath
        : RelativePath[(RelativePath.LastIndexOf('/') + 1)..];

    public int Depth => RelativePath.Count(static c => c == '/');
}

public sealed record FolderComparisonResult
{
    public required string LeftRoot { get; init; }
    public required string RightRoot { get; init; }
    public required IReadOnlyList<FolderEntry> Entries { get; init; }
    public bool Cancelled { get; init; }
    public TimeSpan Elapsed { get; init; }
    public int Identical { get; init; }
    public int Different { get; init; }
    public int LeftOnly { get; init; }
    public int RightOnly { get; init; }
    public int LeftNewer { get; init; }
    public int RightNewer { get; init; }
    public int Errors { get; init; }
    public string? FatalError { get; init; }

    public string Summary => FatalError
        ?? $"{Entries.Count} items, {Different} different, {LeftOnly} left only, {RightOnly} right only, {LeftNewer + RightNewer} newer, {Errors} errors{(Cancelled ? ", cancelled" : "")}.";
}

public sealed record ScanProgress(int Seen, string CurrentPath, int Differences);

public sealed record InlineSpan(int Start, int Length, bool Changed);

public sealed record TextLineMark
{
    public int LineNumber { get; init; }
    public LineChange Change { get; init; }
    public IReadOnlyList<InlineSpan> Spans { get; init; } = [];
}

public sealed record TextHunk
{
    public int Id { get; init; }
    public int LeftStart { get; init; }
    public int LeftCount { get; init; }
    public int RightStart { get; init; }
    public int RightCount { get; init; }
    public IReadOnlyList<string> LeftLines { get; init; } = [];
    public IReadOnlyList<string> RightLines { get; init; } = [];
}

public sealed record TextDiffResult
{
    public required IReadOnlyList<TextLineMark> LeftMarks { get; init; }
    public required IReadOnlyList<TextLineMark> RightMarks { get; init; }
    public required IReadOnlyList<TextHunk> Hunks { get; init; }
    public int Added { get; init; }
    public int Removed { get; init; }
    public int Modified { get; init; }
    public bool Identical => Hunks.Count == 0;
}

public sealed record MergePiece
{
    public int Id { get; init; }
    public MergePieceKind Kind { get; init; }
    public IReadOnlyList<string> Lines { get; init; } = [];
    public IReadOnlyList<string> LeftLines { get; init; } = [];
    public IReadOnlyList<string> RightLines { get; init; } = [];
    public IReadOnlyList<string> BaseLines { get; init; } = [];
    public bool Resolved { get; init; }
}

public sealed record MergeResult
{
    public required IReadOnlyList<MergePiece> Pieces { get; init; }
    public int ConflictCount { get; init; }
    public string RenderedText { get; init; } = "";
    public bool BaseEndedWithNewLine { get; init; }
}

public sealed record StructuredDiff
{
    public required string Path { get; init; }
    public required string Kind { get; init; }
    public string? LeftValue { get; init; }
    public string? RightValue { get; init; }
}

public sealed record TableCompareOptions
{
    public bool HasHeader { get; init; } = true;
    public int HeaderRow { get; init; } = 1;
    public List<string> KeyColumns { get; init; } = [];
    public List<string> IgnoreColumns { get; init; } = [];
    public bool IgnoreRowOrder { get; init; }
    public bool IgnoreCase { get; init; }
    public bool TrimValues { get; init; } = true;
    public string? SheetName { get; init; }
    public char Delimiter { get; init; } = ',';
}

public sealed record TableDiff
{
    public string? Sheet { get; init; }
    public required string Kind { get; init; }
    public string? Key { get; init; }
    public string? Column { get; init; }
    public int? LeftRow { get; init; }
    public int? RightRow { get; init; }
    public string? LeftValue { get; init; }
    public string? RightValue { get; init; }
    public string? Detail { get; init; }
}

public sealed record TableComparison
{
    public IReadOnlyList<string> LeftColumns { get; init; } = [];
    public IReadOnlyList<string> RightColumns { get; init; } = [];
    public IReadOnlyList<string> SheetNames { get; init; } = [];
    public IReadOnlyList<TableDiff> Diffs { get; init; } = [];
    public string? Warning { get; init; }
}

public sealed record ImageDiffResult
{
    public bool PixelCompared { get; init; }
    public bool SameDimensions { get; init; }
    public bool PixelsEqual { get; init; }
    public bool FilesBinaryEqual { get; init; }
    public int LeftWidth { get; init; }
    public int LeftHeight { get; init; }
    public int RightWidth { get; init; }
    public int RightHeight { get; init; }
    public long DifferentPixels { get; init; }
    public long TotalPixels { get; init; }
    public double DifferencePercent { get; init; }
    public string? HeatmapPngPath { get; init; }
    public string? Detail { get; init; }
}

public sealed record BinaryRegion(long Offset, int Length);

public sealed record BinaryDiffResult
{
    public bool Equal { get; init; }
    public long LeftLength { get; init; }
    public long RightLength { get; init; }
    public string LeftSha256 { get; init; } = "";
    public string RightSha256 { get; init; } = "";
    public long DifferentBytes { get; init; }
    public IReadOnlyList<BinaryRegion> Regions { get; init; } = [];
    public bool RegionsTruncated { get; init; }
}

public sealed record HexWindow(long Offset, byte[] Left, byte[] Right, int Count);

public sealed record DocumentPage(int Number, string Text);

public sealed record ExtractedDocument(string Format, IReadOnlyList<DocumentPage> Pages, string? Warning);

public sealed class SyncOperation
{
    public required string Id { get; init; }
    public SyncAction Action { get; set; }
    public SyncDirection Direction { get; set; }
    public required string RelativePath { get; init; }
    public EntryKind Kind { get; init; }
    public long? Bytes { get; init; }
    public string Status { get; set; } = "Pending";
    public string? Detail { get; set; }
    public bool RequiresConfirmation { get; set; }
    public bool Selected { get; set; } = true;
    public long? SourceLength { get; set; }
    public DateTimeOffset? SourceModified { get; set; }
    public long? DestinationLength { get; set; }
    public DateTimeOffset? DestinationModified { get; set; }
}

public sealed record SyncPlan
{
    public required SyncMode Mode { get; init; }
    public required string LeftRoot { get; init; }
    public required string RightRoot { get; init; }
    public required IReadOnlyList<SyncOperation> Operations { get; init; }
    public string? BlockingError { get; init; }
    public long EstimatedBytes { get; init; }
    public int CopyCount { get; init; }
    public int UpdateCount { get; init; }
    public int DeleteCount { get; init; }
    public int ConflictCount { get; init; }
    public int SkipCount { get; init; }
    public long? DestinationFreeBytes { get; init; }
}

public sealed record SyncOpResult(string OperationId, string RelativePath, string Outcome, string? Detail, string? BackupPath);

public sealed record SyncExecutionResult
{
    public required IReadOnlyList<SyncOpResult> Results { get; init; }
    public bool Cancelled { get; init; }
    public TimeSpan Elapsed { get; init; }
    public long BytesTransferred { get; init; }
    public string? JournalPath { get; init; }
}

public sealed record SyncExecuteOptions
{
    public bool AllowDeletes { get; init; }
    public bool MakeBackups { get; init; } = true;
    public string? RecoveryRoot { get; init; }
    public int MaxRetries { get; init; } = 2;
}

public sealed record SessionRecord
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string ComparisonType { get; init; }
    public string? LeftPath { get; init; }
    public string? RightPath { get; init; }
    public string? BasePath { get; init; }
    public string? OutputPath { get; init; }
    public ComparisonRules? Rules { get; init; }
    public FilterRules? Filters { get; init; }
    public string? Layout { get; init; }
    public string? ViewPreferences { get; init; }
    public DateTimeOffset LastOpened { get; init; }
}

public sealed record AppSettings
{
    public string Theme { get; set; } = "System";
    public ComparisonRules Rules { get; set; } = ComparisonRules.Quick;
    public bool RestoreTabs { get; set; } = true;
    public double? WindowWidth { get; set; }
    public double? WindowHeight { get; set; }
    public Dictionary<string, string> Shortcuts { get; set; } = [];
}

public sealed record LoadedText(string Text, string EncodingName, string NewLine, bool Bom, bool EndsWithNewLine);

public sealed record WorkspaceSnapshot(List<SessionRecord> Tabs, string? SelectedId);
