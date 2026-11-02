using System.Security.Cryptography;
using System.Text;
using DiffDesk.Comparison.Text;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Folder;

public sealed class FolderComparer : IFolderComparisonService
{
    private readonly ITextDiffService _text = new TextDiffService();

    public Task<FolderComparisonResult> CompareAsync(
        string left,
        string right,
        ComparisonRules rules,
        FilterRules filters,
        IProgress<ScanProgress>? progress,
        CancellationToken cancellationToken)
    {
        return Task.Run(() => Compare(left, right, rules, filters, progress, cancellationToken), cancellationToken);
    }

    public FolderComparisonResult Compare(
        string left,
        string right,
        ComparisonRules? rules,
        FilterRules? filters,
        IProgress<ScanProgress>? progress,
        CancellationToken cancellationToken)
    {
        rules ??= ComparisonRules.Quick;
        filters ??= FilterRules.Default;
        var watch = System.Diagnostics.Stopwatch.StartNew();
        string leftRoot;
        string rightRoot;
        try
        {
            leftRoot = PathSafety.RequireFullPath(left);
            rightRoot = PathSafety.RequireFullPath(right);
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return Fatal(left, right, ex.Message);
        }

        if (!Directory.Exists(leftRoot))
            return Fatal(leftRoot, rightRoot, "The left folder does not exist.");
        if (!Directory.Exists(rightRoot))
            return Fatal(leftRoot, rightRoot, "The right folder does not exist.");

        var cancelled = false;
        List<Discovered> leftItems;
        List<Discovered> rightItems;
        try
        {
            leftItems = Enumerate(leftRoot, rules, filters, cancellationToken);
            rightItems = Enumerate(rightRoot, rules, filters, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            cancelled = true;
            leftItems = [];
            rightItems = [];
        }

        var comparer = rules.CaseSensitiveNames ? StringComparer.Ordinal : StringComparer.OrdinalIgnoreCase;
        var pairs = new Dictionary<string, Pair>(comparer);
        foreach (var item in leftItems)
            Add(pairs, item, leftSide: true);
        foreach (var item in rightItems)
            Add(pairs, item, leftSide: false);

        var needContent = rules.CompareContent || rules.CompareHash || rules.TextAware;
        if (needContent && !cancelled)
        {
            var work = pairs.Values.Where(static pair => pair.Left?.Kind == EntryKind.File && pair.Right?.Kind == EntryKind.File).ToArray();
            try
            {
                Parallel.ForEach(
                    work,
                    new ParallelOptions
                    {
                        MaxDegreeOfParallelism = Math.Max(1, rules.MaxDegreeOfParallelism),
                        CancellationToken = cancellationToken
                    },
                    pair => Probe(pair, rules, cancellationToken));
            }
            catch (OperationCanceledException)
            {
                cancelled = true;
            }
        }

        var entries = new List<FolderEntry>(pairs.Count);
        var seen = 0;
        foreach (var pair in pairs.Values.OrderBy(static pair => pair.RelativePath, StringComparer.OrdinalIgnoreCase))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var entry = ToEntry(pair, rules);
            if (!Passes(entry, filters))
                continue;
            entries.Add(entry);
            seen++;
            if (seen % 200 == 0)
                progress?.Report(new ScanProgress(seen, entry.RelativePath, entries.Count(static item => item.Status == CompareStatus.Different)));
        }

        watch.Stop();
        progress?.Report(new ScanProgress(entries.Count, "", entries.Count(static item => item.Status == CompareStatus.Different)));
        return Finish(leftRoot, rightRoot, entries, cancelled, watch.Elapsed, null);
    }

    private static void Add(Dictionary<string, Pair> pairs, Discovered item, bool leftSide)
    {
        if (!pairs.TryGetValue(item.RelativePath, out var pair))
        {
            pair = new Pair { RelativePath = item.RelativePath };
            pairs[item.RelativePath] = pair;
        }

        if (leftSide)
        {
            if (pair.Left is not null)
                pair.LeftDuplicate = true;
            else
                pair.Left = item;
        }
        else if (pair.Right is not null)
        {
            pair.RightDuplicate = true;
        }
        else
        {
            pair.Right = item;
        }
    }

    private void Probe(Pair pair, ComparisonRules rules, CancellationToken cancellationToken)
    {
        var left = pair.Left!;
        var right = pair.Right!;
        if (left.ReadError is not null || right.ReadError is not null)
            return;
        try
        {
            if (!File.Exists(left.FullPath) || !File.Exists(right.FullPath))
            {
                pair.ReadError = "A file disappeared during comparison.";
                return;
            }

            if (rules.TextAware)
            {
                var leftText = new TextFileCodec().Read(left.FullPath);
                var rightText = new TextFileCodec().Read(right.FullPath);
                var diff = _text.Compare(leftText.Text, rightText.Text, rules.Text);
                pair.ContentChecked = true;
                pair.ContentEqual = diff.Identical;
                return;
            }

            var sameLength = left.Length == right.Length;
            if (!sameLength)
            {
                pair.ContentChecked = true;
                pair.ContentEqual = false;
            }
            else if (rules.CompareContent || rules.CompareHash)
            {
                pair.ContentEqual = BytesEqual(left.FullPath, right.FullPath, cancellationToken);
                pair.ContentChecked = true;
            }

            if (rules.CompareHash)
            {
                pair.LeftHash = Sha256(left.FullPath, cancellationToken);
                pair.RightHash = Sha256(right.FullPath, cancellationToken);
                pair.ContentChecked = true;
                pair.ContentEqual = pair.LeftHash == pair.RightHash;
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or DecoderFallbackException)
        {
            pair.ReadError = ex.Message;
        }
    }

    private static FolderEntry ToEntry(Pair pair, ComparisonRules rules)
    {
        if (pair.LeftDuplicate || pair.RightDuplicate)
        {
            return Entry(pair, CompareStatus.Error, "More than one item maps to this path. Turn on case-sensitive names if that is intentional.");
        }

        var left = pair.Left;
        var right = pair.Right;
        if (left?.ReadError is not null && right is null)
            return Entry(pair, CompareStatus.Unreadable, left.ReadError);
        if (right?.ReadError is not null && left is null)
            return Entry(pair, CompareStatus.Unreadable, right.ReadError);
        if (pair.ReadError is not null || left?.ReadError is not null || right?.ReadError is not null)
            return Entry(pair, CompareStatus.Error, pair.ReadError ?? left?.ReadError ?? right?.ReadError);

        if (left is null)
            return Entry(pair, CompareStatus.RightOnly, right?.Kind == EntryKind.ReparsePoint ? "Reparse point skipped." : null);
        if (right is null)
            return Entry(pair, CompareStatus.LeftOnly, left.Kind == EntryKind.ReparsePoint ? "Reparse point skipped." : null);
        if (left.Kind == EntryKind.ReparsePoint || right.Kind == EntryKind.ReparsePoint)
            return Entry(pair, CompareStatus.Identical, "Reparse point skipped.");
        if (left.Kind == EntryKind.Directory && right.Kind == EntryKind.Directory)
            return Entry(pair, CompareStatus.Identical, null);

        var sizeDiffers = rules.CompareSize && left.Length != right.Length;
        var timeDiffers = rules.CompareTimestamp && TimestampsDiffer(left.Modified, right.Modified, rules.TimestampTolerance);
        var leftNewer = (left.Modified ?? DateTimeOffset.MinValue) > (right.Modified ?? DateTimeOffset.MinValue);
        CompareStatus status;
        if (pair.ContentChecked)
            status = !pair.ContentEqual ? CompareStatus.Different : timeDiffers ? (leftNewer ? CompareStatus.LeftNewer : CompareStatus.RightNewer) : CompareStatus.Identical;
        else if (sizeDiffers)
            status = CompareStatus.Different;
        else if (timeDiffers)
            status = leftNewer ? CompareStatus.LeftNewer : CompareStatus.RightNewer;
        else
            status = CompareStatus.Identical;

        return Entry(pair, status, null);
    }

    private static FolderEntry Entry(Pair pair, CompareStatus status, string? detail)
    {
        return new FolderEntry
        {
            RelativePath = pair.RelativePath,
            Kind = pair.Left?.Kind ?? pair.Right?.Kind ?? EntryKind.File,
            Status = status,
            Detail = detail,
            LeftLength = pair.Left?.Length,
            RightLength = pair.Right?.Length,
            LeftModified = pair.Left?.Modified,
            RightModified = pair.Right?.Modified,
            LeftHash = pair.LeftHash,
            RightHash = pair.RightHash,
            ContentChecked = pair.ContentChecked,
            ContentEqual = pair.ContentEqual
        };
    }

    private static bool Passes(FolderEntry entry, FilterRules filters)
    {
        if (filters.DifferencesOnly && entry.Status == CompareStatus.Identical)
            return false;
        if (filters.LeftOnly && entry.Status != CompareStatus.LeftOnly)
            return false;
        if (filters.RightOnly && entry.Status != CompareStatus.RightOnly)
            return false;
        return true;
    }

    private static bool TimestampsDiffer(DateTimeOffset? left, DateTimeOffset? right, TimeSpan tolerance)
    {
        if (left is null || right is null)
            return left != right;
        return (left.Value - right.Value).Duration() > tolerance;
    }

    private static List<Discovered> Enumerate(string root, ComparisonRules rules, FilterRules filters, CancellationToken cancellationToken)
    {
        var found = new List<Discovered>();
        var stack = new Stack<(string Full, string Relative)>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { PathSafety.Normalize(root) };
        stack.Push((root, ""));
        while (stack.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var (full, relative) = stack.Pop();
            IEnumerable<string> children;
            try
            {
                children = Directory.EnumerateFileSystemEntries(full);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                if (relative.Length > 0)
                {
                    found.Add(new Discovered
                    {
                        RelativePath = relative,
                        FullPath = full,
                        Kind = EntryKind.Directory,
                        ReadError = ex.Message
                    });
                }

                continue;
            }

            foreach (var child in children)
            {
                cancellationToken.ThrowIfCancellationRequested();
                string name;
                FileAttributes attributes;
                try
                {
                    name = Path.GetFileName(child);
                    attributes = File.GetAttributes(child);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    found.Add(new Discovered
                    {
                        RelativePath = JoinRelative(relative, Path.GetFileName(child)),
                        FullPath = child,
                        Kind = EntryKind.File,
                        ReadError = ex.Message
                    });
                    continue;
                }

                var childRelative = JoinRelative(relative, name);
                if (childRelative.Count(static c => c == '/') > 200)
                {
                    found.Add(new Discovered { RelativePath = childRelative, FullPath = child, Kind = EntryKind.Directory, ReadError = "The folder is nested too deeply." });
                    continue;
                }

                var isReparse = (attributes & FileAttributes.ReparsePoint) != 0;
                var isDir = (attributes & FileAttributes.Directory) != 0;
                if (isReparse && !rules.FollowReparsePoints)
                {
                    if (!Excluded(childRelative, attributes, null, null, filters, isDirectory: true))
                        found.Add(new Discovered { RelativePath = childRelative, FullPath = child, Kind = EntryKind.ReparsePoint });
                    continue;
                }

                if (isReparse && isDir)
                {
                    FileSystemInfo? target = null;
                    try
                    {
                        target = Directory.ResolveLinkTarget(child, returnFinalTarget: false);
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        found.Add(new Discovered { RelativePath = childRelative, FullPath = child, Kind = EntryKind.ReparsePoint, ReadError = ex.Message });
                        continue;
                    }

                    if (target is null || !PathSafety.IsInside(root, target.FullName) || !seen.Add(PathSafety.Normalize(target.FullName)))
                    {
                        found.Add(new Discovered { RelativePath = childRelative, FullPath = child, Kind = EntryKind.ReparsePoint, ReadError = "The link was skipped because it leaves the folder or loops." });
                        continue;
                    }
                }

                if (isDir)
                {
                    if (ShouldDescend(childRelative, attributes, filters))
                    {
                        if (!Excluded(childRelative, attributes, null, null, filters, isDirectory: true))
                            found.Add(new Discovered { RelativePath = childRelative, FullPath = child, Kind = EntryKind.Directory });
                        stack.Push((isReparse ? Directory.ResolveLinkTarget(child, false)!.FullName : child, childRelative));
                    }

                    continue;
                }

                long? length = null;
                DateTimeOffset? modified = null;
                string? error = null;
                try
                {
                    var info = new FileInfo(child);
                    length = info.Length;
                    modified = new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    error = ex.Message;
                }

                if (error is null && Excluded(childRelative, attributes, length, modified, filters, isDirectory: false))
                    continue;
                found.Add(new Discovered
                {
                    RelativePath = childRelative,
                    FullPath = child,
                    Kind = EntryKind.File,
                    Length = length,
                    Modified = modified,
                    ReadError = error,
                    Attributes = attributes
                });
            }
        }

        return found;
    }

    private static bool ShouldDescend(string relative, FileAttributes attributes, FilterRules filters)
    {
        if (!Excluded(relative, attributes, null, null, filters, isDirectory: true))
            return true;
        var prefix = relative.TrimEnd('/') + "/";
        return filters.AlwaysIncludeRelativePaths.Any(path =>
            path.Equals(relative, StringComparison.OrdinalIgnoreCase)
            || PathFilter.Normalize(path).StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    private static bool Excluded(string relative, FileAttributes attributes, long? length, DateTimeOffset? modified, FilterRules filters, bool isDirectory)
    {
        var normal = PathFilter.Normalize(relative);
        if (filters.AlwaysIncludeRelativePaths.Any(path => PathFilter.Normalize(path).Equals(normal, StringComparison.OrdinalIgnoreCase)))
            return false;
        if (!isDirectory && filters.IncludeExtensions.Count > 0 && !filters.IncludeExtensions.Any(ext => ExtensionEquals(normal, ext)))
            return true;
        if (!isDirectory && filters.ExcludeExtensions.Any(ext => ExtensionEquals(normal, ext)))
            return true;
        if (!isDirectory && filters.IncludeGlobs.Count > 0 && !filters.IncludeGlobs.Any(pattern => PathFilter.IsMatch(normal, pattern)))
            return true;
        if (filters.ExcludeGlobs.Any(pattern => PathFilter.IsMatch(normal, pattern) || (isDirectory && PathFilter.IsMatch(normal + "/x", pattern))))
            return true;
        if (!isDirectory && filters.ExcludeHidden && (attributes & FileAttributes.Hidden) != 0)
            return true;
        if (!isDirectory && filters.ExcludeSystem && (attributes & FileAttributes.System) != 0)
            return true;
        if (!isDirectory && filters.MinBytes is long min && length is long size && size < min)
            return true;
        if (!isDirectory && filters.MaxBytes is long max && length is long size2 && size2 > max)
            return true;
        if (!isDirectory && filters.ModifiedAfter is DateTimeOffset after && modified is DateTimeOffset when && when < after)
            return true;
        if (!isDirectory && filters.ModifiedBefore is DateTimeOffset before && modified is DateTimeOffset when2 && when2 > before)
            return true;
        return false;
    }

    private static bool ExtensionEquals(string relative, string extension)
    {
        var wanted = extension.Trim().TrimStart('.').ToLowerInvariant();
        var actual = Path.GetExtension(relative).TrimStart('.').ToLowerInvariant();
        return actual == wanted;
    }

    private static string JoinRelative(string parent, string name) =>
        string.IsNullOrEmpty(parent) ? name : parent + "/" + name;

    private static bool BytesEqual(string left, string right, CancellationToken cancellationToken)
    {
        using var a = Open(left);
        using var b = Open(right);
        if (a.Length != b.Length)
            return false;
        var leftBuffer = new byte[128 * 1024];
        var rightBuffer = new byte[128 * 1024];
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var leftRead = a.Read(leftBuffer);
            var rightRead = b.Read(rightBuffer);
            if (leftRead != rightRead)
                return false;
            if (leftRead == 0)
                return true;
            if (!leftBuffer.AsSpan(0, leftRead).SequenceEqual(rightBuffer.AsSpan(0, rightRead)))
                return false;
        }
    }

    internal static string Sha256(string path, CancellationToken cancellationToken)
    {
        using var sha = SHA256.Create();
        using var stream = Open(path);
        var buffer = new byte[128 * 1024];
        int read;
        while ((read = stream.Read(buffer)) > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            sha.TransformBlock(buffer, 0, read, null, 0);
        }

        sha.TransformFinalBlock([], 0, 0);
        return Convert.ToHexString(sha.Hash!).ToLowerInvariant();
    }

    private static FileStream Open(string path) =>
        new(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 128 * 1024, FileOptions.SequentialScan);

    private static FolderComparisonResult Fatal(string left, string right, string message) =>
        Finish(left, right, [], false, TimeSpan.Zero, message);

    private static FolderComparisonResult Finish(string left, string right, List<FolderEntry> entries, bool cancelled, TimeSpan elapsed, string? fatal)
    {
        return new FolderComparisonResult
        {
            LeftRoot = left,
            RightRoot = right,
            Entries = entries,
            Cancelled = cancelled,
            Elapsed = elapsed,
            FatalError = fatal,
            Identical = entries.Count(static entry => entry.Status == CompareStatus.Identical),
            Different = entries.Count(static entry => entry.Status == CompareStatus.Different),
            LeftOnly = entries.Count(static entry => entry.Status == CompareStatus.LeftOnly),
            RightOnly = entries.Count(static entry => entry.Status == CompareStatus.RightOnly),
            LeftNewer = entries.Count(static entry => entry.Status == CompareStatus.LeftNewer),
            RightNewer = entries.Count(static entry => entry.Status == CompareStatus.RightNewer),
            Errors = entries.Count(static entry => entry.Status is CompareStatus.Error or CompareStatus.Unreadable)
        };
    }

    private sealed class Pair
    {
        public string RelativePath { get; set; } = "";
        public Discovered? Left { get; set; }
        public Discovered? Right { get; set; }
        public bool LeftDuplicate { get; set; }
        public bool RightDuplicate { get; set; }
        public bool ContentChecked { get; set; }
        public bool ContentEqual { get; set; }
        public string? LeftHash { get; set; }
        public string? RightHash { get; set; }
        public string? ReadError { get; set; }
    }

    private sealed class Discovered
    {
        public required string RelativePath { get; init; }
        public required string FullPath { get; init; }
        public required EntryKind Kind { get; init; }
        public long? Length { get; init; }
        public DateTimeOffset? Modified { get; init; }
        public string? ReadError { get; init; }
        public FileAttributes Attributes { get; init; }
    }
}
