using DiffDesk.Application;
using DiffDesk.Comparison.Folder;
using DiffDesk.Domain;
using DiffDesk.Sync;

namespace DiffDesk.UnitTests;

public class FolderSyncTests
{
    private readonly FolderComparer _folders = new();
    private readonly SyncPlanner _planner = new();
    private readonly SyncExecutor _executor = new();

    [Fact]
    public void FolderCompare_ClassifiesMetadataAndContent()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        File.WriteAllText(Path.Combine(left, "same.txt"), "same");
        File.WriteAllText(Path.Combine(right, "same.txt"), "same");
        File.WriteAllText(Path.Combine(left, "only-left.txt"), "L");
        File.WriteAllText(Path.Combine(right, "only-right.txt"), "R");
        File.WriteAllText(Path.Combine(left, "size.txt"), "a");
        File.WriteAllText(Path.Combine(right, "size.txt"), "ab");
        File.WriteAllText(Path.Combine(left, "time.txt"), "time");
        File.WriteAllText(Path.Combine(right, "time.txt"), "time");
        var older = DateTime.UtcNow.AddMinutes(-10);
        File.SetLastWriteTimeUtc(Path.Combine(left, "time.txt"), DateTime.UtcNow);
        File.SetLastWriteTimeUtc(Path.Combine(right, "time.txt"), older);
        Directory.CreateDirectory(Path.Combine(left, "docs"));
        Directory.CreateDirectory(Path.Combine(right, "docs"));

        var quick = _folders.Compare(left, right, ComparisonRules.Quick, FilterRules.Default, null, CancellationToken.None);
        Assert.Null(quick.FatalError);
        Assert.Equal(CompareStatus.Identical, Find(quick, "same.txt").Status);
        Assert.Equal(CompareStatus.LeftOnly, Find(quick, "only-left.txt").Status);
        Assert.Equal(CompareStatus.RightOnly, Find(quick, "only-right.txt").Status);
        Assert.Equal(CompareStatus.Different, Find(quick, "size.txt").Status);
        Assert.False(Find(quick, "size.txt").ContentChecked);
        Assert.Equal(CompareStatus.LeftNewer, Find(quick, "time.txt").Status);
        Assert.Equal(CompareStatus.Identical, Find(quick, "docs").Status);

        var content = _folders.Compare(left, right, ComparisonRules.WithContent, FilterRules.Default, null, CancellationToken.None);
        var timed = Find(content, "time.txt");
        Assert.Equal(CompareStatus.LeftNewer, timed.Status);
        Assert.True(timed.ContentChecked);
        Assert.True(timed.ContentEqual);
        Assert.Equal(CompareStatus.Different, Find(content, "size.txt").Status);

        var namesOnly = new ComparisonRules { CompareSize = false, CompareTimestamp = false };
        var names = _folders.Compare(left, right, namesOnly, FilterRules.Default, null, CancellationToken.None);
        Assert.Equal(CompareStatus.Identical, Find(names, "size.txt").Status);
    }

    [Fact]
    public void FolderCompare_FiltersAndAlwaysInclude()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        File.WriteAllText(Path.Combine(left, "keep.txt"), "a");
        File.WriteAllText(Path.Combine(right, "keep.txt"), "a");
        File.WriteAllText(Path.Combine(left, "noise.log"), "x");
        File.WriteAllText(Path.Combine(right, "noise.log"), "y");
        File.WriteAllText(Path.Combine(left, "special.log"), "keep");
        File.WriteAllText(Path.Combine(right, "special.log"), "kept-longer");
        var filters = new FilterRules
        {
            ExcludeGlobs = ["*.log"],
            AlwaysIncludeRelativePaths = ["special.log"],
            DifferencesOnly = true
        };
        var result = _folders.Compare(left, right, ComparisonRules.Quick, filters, null, CancellationToken.None);
        Assert.True(result.Entries.All(entry => entry.RelativePath != "noise.log"));
        Assert.True(result.Entries.All(entry => entry.RelativePath != "keep.txt"));
        Assert.True(result.Entries.Any(entry => entry.RelativePath == "special.log"));
    }

    [Fact]
    public void FolderCompare_SkipsReparsePointsUnlessFollowed()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        var real = Path.Combine(left, "real");
        Directory.CreateDirectory(real);
        File.WriteAllText(Path.Combine(real, "a.txt"), "a");
        Directory.CreateDirectory(Path.Combine(right, "real"));
        File.WriteAllText(Path.Combine(right, "real", "a.txt"), "a");
        var link = Path.Combine(left, "link");
        var created = TryJunction(link, real);
        if (!created)
            return;

        var skipped = _folders.Compare(left, right, ComparisonRules.Quick, FilterRules.Default, null, CancellationToken.None);
        Assert.Equal(EntryKind.ReparsePoint, Find(skipped, "link").Kind);
        Assert.True(skipped.Entries.All(entry => entry.RelativePath != "link/a.txt"));
        Assert.True(skipped.Entries.Any(entry => entry.RelativePath == "real/a.txt"));
    }

    [Fact]
    public void CancelledCompareDoesNotReturnASuccessfulScan()
    {
        using var dir = new TempDir();
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var threw = false;
        FolderComparisonResult? result = null;
        try
        {
            result = _folders.Compare(dir.Sub("left"), dir.Sub("right"), ComparisonRules.Quick, FilterRules.Default, null, cts.Token);
        }
        catch (OperationCanceledException)
        {
            threw = true;
        }

        Assert.True(threw || result?.Cancelled == true);
    }

    [Fact]
    public void Planner_MirrorDeletesUpdateDoesNotAndTwoWayConflicts()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        var comparison = Sample(left, right);
        var mirror = _planner.Plan(comparison, SyncMode.MirrorLeftToRight);
        Assert.Equal(SyncAction.Copy, Action(mirror, "only-left.txt"));
        Assert.Equal(SyncAction.Delete, Action(mirror, "only-right.txt"));
        Assert.Equal(SyncAction.Update, Action(mirror, "changed.txt"));
        Assert.Equal(SyncAction.Skip, Action(mirror, "link"));

        var update = _planner.Plan(comparison, SyncMode.UpdateRightFromLeft);
        Assert.Equal(SyncAction.Skip, Action(update, "only-right.txt"));
        Assert.Equal(SyncAction.Copy, Action(update, "only-left.txt"));

        var otherWay = _planner.Plan(comparison, SyncMode.MirrorRightToLeft);
        Assert.Equal(SyncAction.Delete, Action(otherWay, "only-left.txt"));
        Assert.Equal(SyncAction.Copy, Action(otherWay, "only-right.txt"));

        var twoWay = _planner.Plan(comparison, SyncMode.TwoWay);
        Assert.Equal(SyncAction.Conflict, Action(twoWay, "changed.txt"));
        Assert.Equal(SyncAction.Copy, Action(twoWay, "only-left.txt"));
        Assert.Contains("not assumed", twoWay.Operations.Single(op => op.RelativePath == "changed.txt").Detail);
    }

    [Fact]
    public void PlannerAndExecutor_BlockOverlappingRoots()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var child = Directory.CreateDirectory(Path.Combine(left, "child")).FullName;
        File.WriteAllText(Path.Combine(child, "marker.txt"), "stay");
        var comparison = new FolderComparisonResult
        {
            LeftRoot = left,
            RightRoot = child,
            Entries = [new FolderEntry { RelativePath = "marker.txt", Kind = EntryKind.File, Status = CompareStatus.LeftOnly, LeftLength = 4 }]
        };
        var plan = _planner.Plan(comparison, SyncMode.MirrorLeftToRight);
        Assert.NotNull(plan.BlockingError);
        Assert.Empty(plan.Operations);
        var executed = _executor.ExecuteAsync(plan, new SyncExecuteOptions { AllowDeletes = true, RecoveryRoot = dir.Sub("recovery") }, null, CancellationToken.None).GetAwaiter().GetResult();
        Assert.Equal("Error", Assert.Single(executed.Results).Outcome);
        Assert.Equal("stay", File.ReadAllText(Path.Combine(child, "marker.txt")));
    }

    [Fact]
    public async Task Executor_CopiesUpdatesBacksUpAndUndoes()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        Directory.CreateDirectory(Path.Combine(left, "sub"));
        File.WriteAllText(Path.Combine(left, "sub", "new.txt"), "new");
        File.WriteAllText(Path.Combine(left, "changed.txt"), "left");
        File.WriteAllText(Path.Combine(right, "changed.txt"), "right");
        File.WriteAllText(Path.Combine(right, "extra.txt"), "extra");
        var comparison = _folders.Compare(left, right, ComparisonRules.WithContent, FilterRules.Default, null, CancellationToken.None);
        var plan = _planner.Plan(comparison, SyncMode.UpdateRightFromLeft);
        var dry = plan.Operations.Where(op => op.Selected).Select(op => op.RelativePath).ToList();
        Assert.Contains("sub/new.txt", dry);
        Assert.DoesNotContain("extra.txt", dry);
        Assert.Equal("extra", File.ReadAllText(Path.Combine(right, "extra.txt")));

        var recovery = dir.Sub("recovery");
        var executed = await _executor.ExecuteAsync(plan, new SyncExecuteOptions { AllowDeletes = false, MakeBackups = true, RecoveryRoot = recovery }, null, CancellationToken.None);
        Assert.Equal("new", File.ReadAllText(Path.Combine(right, "sub", "new.txt")));
        Assert.Equal("left", File.ReadAllText(Path.Combine(right, "changed.txt")));
        Assert.Equal("extra", File.ReadAllText(Path.Combine(right, "extra.txt")));
        Assert.True(executed.Results.All(result => result.Outcome != "Error"));
        Assert.True(File.Exists(executed.JournalPath));

        var restored = await _executor.UndoAsync(executed.JournalPath!, CancellationToken.None);
        Assert.True(restored >= 2);
        Assert.False(File.Exists(Path.Combine(right, "sub", "new.txt")));
        Assert.Equal("right", File.ReadAllText(Path.Combine(right, "changed.txt")));
    }

    [Fact]
    public async Task Executor_RequiresConfirmationAndRefusesRecursiveDelete()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        Directory.CreateDirectory(Path.Combine(right, "keep"));
        File.WriteAllText(Path.Combine(right, "keep", "secret.txt"), "secret");
        File.WriteAllText(Path.Combine(right, "gone.txt"), "gone");
        var filters = new FilterRules { ExcludeGlobs = ["secret.txt"] };
        var comparison = _folders.Compare(left, right, ComparisonRules.Quick, filters, null, CancellationToken.None);
        var plan = _planner.Plan(comparison, SyncMode.MirrorLeftToRight);
        Assert.True(plan.DeleteCount >= 1);
        var blocked = await _executor.ExecuteAsync(plan, new SyncExecuteOptions { AllowDeletes = false, RecoveryRoot = dir.Sub("recovery-a") }, null, CancellationToken.None);
        Assert.Equal("gone", File.ReadAllText(Path.Combine(right, "gone.txt")));
        Assert.True(blocked.Results.Any(result => result.Outcome == "Skipped"));

        var executed = await _executor.ExecuteAsync(plan, new SyncExecuteOptions { AllowDeletes = true, MakeBackups = true, RecoveryRoot = dir.Sub("recovery-b") }, null, CancellationToken.None);
        Assert.False(File.Exists(Path.Combine(right, "gone.txt")));
        Assert.Equal("secret", File.ReadAllText(Path.Combine(right, "keep", "secret.txt")));
        Assert.True(executed.Results.Any(result => result.RelativePath == "keep" && result.Outcome == "Error"));
    }

    [Fact]
    public void Report_EncodesHtmlAndWritesAtomically()
    {
        var result = new FolderComparisonResult
        {
            LeftRoot = "L",
            RightRoot = "R",
            Entries =
            [
                new FolderEntry { RelativePath = "a<b.txt", Kind = EntryKind.File, Status = CompareStatus.Different, Detail = "1 & 2" }
            ],
            Different = 1
        };
        var reports = new ComparisonReportService();
        var html = reports.BuildFolderReport(result, ReportFormat.Html);
        Assert.Contains("a&lt;b.txt", html);
        Assert.Contains("1 &amp; 2", html);
        Assert.DoesNotContain("<td>a<b.txt", html);
        var json = reports.BuildFolderReport(result, ReportFormat.Json);
        Assert.Contains("Different", json);
        using var dir = new TempDir();
        var path = Path.Combine(dir.Path, "out", "report.txt");
        reports.Write(path, "first");
        reports.Write(path, "second");
        Assert.Equal("second", File.ReadAllText(path));
        Assert.False(File.Exists(path + ".diffdesk.tmp"));
    }

    private static FolderEntry Find(FolderComparisonResult result, string relative) =>
        Assert.Single(result.Entries, entry => entry.RelativePath == relative);

    private static SyncAction Action(SyncPlan plan, string relative) =>
        Assert.Single(plan.Operations, operation => operation.RelativePath == relative).Action;

    private static FolderComparisonResult Sample(string left, string right) => new()
    {
        LeftRoot = left,
        RightRoot = right,
        Entries =
        [
            new FolderEntry { RelativePath = "only-left.txt", Kind = EntryKind.File, Status = CompareStatus.LeftOnly, LeftLength = 1 },
            new FolderEntry { RelativePath = "only-right.txt", Kind = EntryKind.File, Status = CompareStatus.RightOnly, RightLength = 1 },
            new FolderEntry { RelativePath = "changed.txt", Kind = EntryKind.File, Status = CompareStatus.Different, LeftLength = 4, RightLength = 5 },
            new FolderEntry { RelativePath = "same.txt", Kind = EntryKind.File, Status = CompareStatus.Identical, ContentChecked = true, ContentEqual = true },
            new FolderEntry { RelativePath = "link", Kind = EntryKind.ReparsePoint, Status = CompareStatus.Identical }
        ]
    };

    private static bool TryJunction(string link, string target)
    {
        if (Directory.Exists(link))
            return true;
        using var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c mklink /J \"" + link + "\" \"" + target + "\"",
            UseShellExecute = false,
            CreateNoWindow = true
        });
        process?.WaitForExit(5000);
        return Directory.Exists(link);
    }
}
