using System.Text.Json;
using DiffDesk.Domain;

namespace DiffDesk.Sync;

public sealed class SyncExecutor : ISynchronizationExecutor
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private readonly IFileSystemService _files;
    private readonly IBackupService _backups;

    public SyncExecutor(IFileSystemService files, IBackupService backups)
    {
        _files = files;
        _backups = backups;
    }

    public SyncExecutor()
        : this(new PhysicalFileSystem(), new BackupService())
    {
    }

    public async Task<SyncExecutionResult> ExecuteAsync(SyncPlan plan, SyncExecuteOptions options, IProgress<string>? progress, CancellationToken cancellationToken)
    {
        var watch = System.Diagnostics.Stopwatch.StartNew();
        if (!string.IsNullOrEmpty(plan.BlockingError))
        {
            return new SyncExecutionResult
            {
                Results = [new SyncOpResult("", "", "Error", plan.BlockingError, null)],
                Elapsed = watch.Elapsed
            };
        }

        var overlap = PathSafety.OverlapMessage(plan.LeftRoot, plan.RightRoot);
        if (overlap is not null)
        {
            return new SyncExecutionResult
            {
                Results = [new SyncOpResult("", "", "Error", overlap, null)],
                Elapsed = watch.Elapsed
            };
        }

        var recovery = options.RecoveryRoot ?? Path.Combine(Path.GetTempPath(), "DiffDesk");
        var runDir = Path.Combine(recovery, DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(runDir);
        var journal = Path.Combine(runDir, "journal.jsonl");
        var backupRoot = Path.Combine(runDir, "backup");
        var results = new List<SyncOpResult>();
        long bytes = 0;
        foreach (var operation in Order(plan.Operations.Where(static op => op.Selected && op.Action != SyncAction.Skip)))
        {
            if (cancellationToken.IsCancellationRequested)
            {
                results.Add(new SyncOpResult(operation.Id, operation.RelativePath, "Cancelled", "Stopped before this operation.", null));
                watch.Stop();
                return new SyncExecutionResult
                {
                    Results = results,
                    Cancelled = true,
                    Elapsed = watch.Elapsed,
                    BytesTransferred = bytes,
                    JournalPath = journal
                };
            }

            var result = await Task.Run(() => ExecuteOne(plan, operation, options, backupRoot), cancellationToken).ConfigureAwait(false);
            results.Add(result);
            await File.AppendAllTextAsync(journal, JsonSerializer.Serialize(new JournalRow(operation, result, plan), Json) + Environment.NewLine, cancellationToken).ConfigureAwait(false);
            if (result.Outcome is "Copied" or "Updated")
                bytes += operation.Bytes ?? 0;
            progress?.Report(operation.RelativePath);
        }

        watch.Stop();
        return new SyncExecutionResult
        {
            Results = results,
            Elapsed = watch.Elapsed,
            BytesTransferred = bytes,
            JournalPath = journal
        };
    }

    public async Task<int> UndoAsync(string journalPath, CancellationToken cancellationToken)
    {
        if (!File.Exists(journalPath))
            throw new FileNotFoundException("The operation journal was not found.", journalPath);
        var rows = new List<JournalRow>();
        foreach (var line in await File.ReadAllLinesAsync(journalPath, cancellationToken).ConfigureAwait(false))
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;
            var row = JsonSerializer.Deserialize<JournalRow>(line, Json);
            if (row is not null)
                rows.Add(row);
        }

        var restored = 0;
        for (var i = rows.Count - 1; i >= 0; i--)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var row = rows[i];
            if (row.Outcome is not ("Copied" or "Updated" or "Deleted"))
                continue;
            var destination = row.DestinationPath;
            if (string.IsNullOrEmpty(destination))
                continue;
            if (!string.IsNullOrEmpty(row.BackupPath) && File.Exists(row.BackupPath))
            {
                _files.CopyAtomic(row.BackupPath, destination);
                restored++;
            }
            else if (row.CreatedNew && File.Exists(destination))
            {
                _files.DeleteFile(destination);
                restored++;
            }
            else if (row.CreatedDirectory && Directory.Exists(destination))
            {
                if (_files.DeleteDirectoryIfEmpty(destination))
                    restored++;
            }
        }

        return restored;
    }

    private SyncOpResult ExecuteOne(SyncPlan plan, SyncOperation operation, SyncExecuteOptions options, string backupRoot)
    {
        if (operation.Action == SyncAction.Conflict)
            return new SyncOpResult(operation.Id, operation.RelativePath, "Conflict", "The conflict was not resolved.", null);
        if (operation.Action == SyncAction.Delete && !options.AllowDeletes)
            return new SyncOpResult(operation.Id, operation.RelativePath, "Skipped", "Delete was not confirmed.", null);

        try
        {
            return Retry(options.MaxRetries, () => RunOnce(plan, operation, options, backupRoot));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            return new SyncOpResult(operation.Id, operation.RelativePath, "Error", ex.Message, null);
        }
    }

    private SyncOpResult RunOnce(SyncPlan plan, SyncOperation operation, SyncExecuteOptions options, string backupRoot)
    {
        if (operation.Action == SyncAction.Delete)
        {
            var root = plan.Mode == SyncMode.MirrorRightToLeft ? plan.LeftRoot : plan.RightRoot;
            var target = _files.CombineUnderRoot(root, operation.RelativePath);
            if (_files.IsReparsePoint(target))
                return new SyncOpResult(operation.Id, operation.RelativePath, "Skipped", "Reparse points are not deleted.", null);
            if (!Matches(target, operation.SourceLength, operation.SourceModified) && operation.Kind == EntryKind.File)
                return new SyncOpResult(operation.Id, operation.RelativePath, "Error", "The file changed after the preview.", null);
            string? backup = null;
            if (options.MakeBackups && File.Exists(target))
                backup = _backups.Backup(target, backupRoot, operation.RelativePath);
            if (File.Exists(target))
                _files.DeleteFile(target);
            else if (Directory.Exists(target))
            {
                if (!_files.DeleteDirectoryIfEmpty(target))
                    return new SyncOpResult(operation.Id, operation.RelativePath, "Error", "The folder was not empty, so it was not deleted.", null);
            }

            operation.Status = "Deleted";
            Remember(operation, target, backup, createdNew: false, createdDirectory: operation.Kind == EntryKind.Directory);
            return new SyncOpResult(operation.Id, operation.RelativePath, "Deleted", null, backup);
        }

        var sourceRoot = operation.Direction == SyncDirection.RightToLeft ? plan.RightRoot : plan.LeftRoot;
        var destRoot = operation.Direction == SyncDirection.RightToLeft ? plan.LeftRoot : plan.RightRoot;
        var source = _files.CombineUnderRoot(sourceRoot, operation.RelativePath);
        var destination = _files.CombineUnderRoot(destRoot, operation.RelativePath);
        if (_files.IsReparsePoint(source) || _files.IsReparsePoint(destination))
            return new SyncOpResult(operation.Id, operation.RelativePath, "Skipped", "Reparse points are not copied.", null);
        if (operation.Kind == EntryKind.Directory)
        {
            var created = !Directory.Exists(destination);
            _files.CreateDirectory(destination);
            operation.Status = "Copied";
            Remember(operation, destination, null, createdNew: false, createdDirectory: created);
            return new SyncOpResult(operation.Id, operation.RelativePath, "Copied", null, null);
        }

        if (!File.Exists(source))
            return new SyncOpResult(operation.Id, operation.RelativePath, "Error", "The source disappeared before it was copied.", null);
        if (!Matches(source, operation.SourceLength, operation.SourceModified))
            return new SyncOpResult(operation.Id, operation.RelativePath, "Error", "The source changed after the preview.", null);
        if (operation.Action == SyncAction.Update && File.Exists(destination) && !Matches(destination, operation.DestinationLength, operation.DestinationModified))
            return new SyncOpResult(operation.Id, operation.RelativePath, "Error", "The destination changed after the preview.", null);

        string? copyBackup = null;
        var createdNew = !File.Exists(destination);
        if (!createdNew && options.MakeBackups)
            copyBackup = _backups.Backup(destination, backupRoot, operation.RelativePath);
        _files.CopyAtomic(source, destination);
        operation.Status = operation.Action == SyncAction.Update ? "Updated" : "Copied";
        Remember(operation, destination, copyBackup, createdNew, createdDirectory: false);
        return new SyncOpResult(operation.Id, operation.RelativePath, operation.Status, null, copyBackup);
    }

    private static SyncOpResult Retry(int times, Func<SyncOpResult> action)
    {
        var attempt = 0;
        while (true)
        {
            try
            {
                return action();
            }
            catch (IOException) when (attempt < times)
            {
                attempt++;
                Thread.Sleep(100 * attempt);
            }
        }
    }

    private static bool Matches(string path, long? length, DateTimeOffset? modified)
    {
        if (!File.Exists(path))
            return length is null;
        var info = new FileInfo(path);
        if (length is long expected && info.Length != expected)
            return false;
        if (modified is DateTimeOffset stamp && (new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero) - stamp).Duration() > TimeSpan.FromSeconds(2))
            return false;
        return true;
    }

    private static IEnumerable<SyncOperation> Order(IEnumerable<SyncOperation> operations)
    {
        var list = operations.ToList();
        var writes = list.Where(static op => op.Action is SyncAction.Copy or SyncAction.Update)
            .OrderBy(static op => op.RelativePath.Count(static c => c == '/'))
            .ThenBy(static op => op.RelativePath, StringComparer.OrdinalIgnoreCase);
        var deletes = list.Where(static op => op.Action == SyncAction.Delete)
            .OrderByDescending(static op => op.RelativePath.Count(static c => c == '/'));
        return writes.Concat(deletes);
    }

    private static void Remember(SyncOperation operation, string destination, string? backup, bool createdNew, bool createdDirectory)
    {
        operation.Detail = destination + "\n" + (backup ?? "") + "\n" + createdNew + "\n" + createdDirectory;
    }

    private sealed class JournalRow
    {
        public JournalRow()
        {
        }

        public JournalRow(SyncOperation operation, SyncOpResult result, SyncPlan plan)
        {
            Id = operation.Id;
            RelativePath = operation.RelativePath;
            Outcome = result.Outcome;
            BackupPath = result.BackupPath;
            var parts = (operation.Detail ?? "").Split('\n');
            DestinationPath = parts.Length > 0 ? parts[0] : "";
            CreatedNew = parts.Length > 2 && bool.TryParse(parts[2], out var created) && created;
            CreatedDirectory = parts.Length > 3 && bool.TryParse(parts[3], out var directory) && directory;
            LeftRoot = plan.LeftRoot;
            RightRoot = plan.RightRoot;
        }

        public string Id { get; set; } = "";
        public string RelativePath { get; set; } = "";
        public string Outcome { get; set; } = "";
        public string? BackupPath { get; set; }
        public string? DestinationPath { get; set; }
        public bool CreatedNew { get; set; }
        public bool CreatedDirectory { get; set; }
        public string LeftRoot { get; set; } = "";
        public string RightRoot { get; set; } = "";
    }
}
