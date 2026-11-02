namespace DiffDesk.Domain;

public interface IFolderComparisonService
{
    Task<FolderComparisonResult> CompareAsync(
        string left,
        string right,
        ComparisonRules rules,
        FilterRules filters,
        IProgress<ScanProgress>? progress,
        CancellationToken cancellationToken);
}

public interface ITextDiffService
{
    TextDiffResult Compare(string left, string right, TextCompareOptions options);
    string ApplyHunk(string document, int start, int count, IReadOnlyList<string> replacement, string newLine, bool endsWithNewLine);
    string ToUnified(string leftLabel, string rightLabel, TextDiffResult diff);
}

public interface IThreeWayMergeService
{
    MergeResult Merge(string baseText, string leftText, string rightText, TextCompareOptions options);
    MergeResult Resolve(MergeResult current, int pieceId, MergeResolution resolution);
    string Render(MergeResult result, bool includeConflictMarkers);
}

public interface IStructuredDiffService
{
    IReadOnlyList<StructuredDiff> CompareJson(string left, string right, bool ignoreObjectOrder, ArrayCompareMode arrays, string? arrayKey);
    IReadOnlyList<StructuredDiff> CompareXml(string left, string right, bool ignoreAttributeOrder, bool ignoreInsignificantWhitespace);
}

public interface ITableComparisonService
{
    TableComparison CompareCsv(string leftPath, string rightPath, TableCompareOptions options);
    TableComparison CompareXlsx(string leftPath, string rightPath, TableCompareOptions options);
    string ExportCsv(TableComparison comparison);
}

public interface IImageComparisonService
{
    ImageDiffResult Compare(string leftPath, string rightPath, int channelTolerance, string? heatmapPath, CancellationToken cancellationToken);
}

public interface IBinaryComparisonService
{
    BinaryDiffResult Compare(string leftPath, string rightPath, CancellationToken cancellationToken);
    HexWindow ReadWindow(string leftPath, string rightPath, long offset, int length);
}

public interface IDocumentTextService
{
    ExtractedDocument Extract(string path);
}

public interface ISynchronizationPlanner
{
    SyncPlan Plan(FolderComparisonResult comparison, SyncMode mode);
}

public interface ISynchronizationExecutor
{
    Task<SyncExecutionResult> ExecuteAsync(SyncPlan plan, SyncExecuteOptions options, IProgress<string>? progress, CancellationToken cancellationToken);
    Task<int> UndoAsync(string journalPath, CancellationToken cancellationToken);
}

public interface IBackupService
{
    string Backup(string sourceFile, string backupRoot, string relativePath);
}

public interface IFileSystemService
{
    string RequireFullPath(string path);
    string CombineUnderRoot(string root, string relativePath);
    bool SameOrNested(string first, string second);
    bool IsReparsePoint(string path);
    void CopyAtomic(string source, string destination);
    void DeleteFile(string path);
    void CreateDirectory(string path);
    bool DeleteDirectoryIfEmpty(string path);
}

public interface ISessionRepository
{
    IReadOnlyList<SessionRecord> List();
    void Save(SessionRecord session);
    void Delete(string id);
    SessionRecord? Find(string id);
    SessionRecord Duplicate(string id);
    void Export(string id, string path);
    SessionRecord Import(string path);
    void SaveWorkspace(WorkspaceSnapshot snapshot);
    WorkspaceSnapshot? LoadWorkspace();
}

public interface ISettingsStore
{
    AppSettings Load();
    void Save(AppSettings settings);
}

public interface IComparisonReportService
{
    string BuildFolderReport(FolderComparisonResult result, ReportFormat format);
    string BuildTextReport(string leftLabel, string rightLabel, TextDiffResult diff, ReportFormat format);
    void Write(string path, string content);
}

public interface ITextFileStore
{
    LoadedText Read(string path);
    void WriteAtomic(string path, string text, LoadedText original, bool backup);
}
