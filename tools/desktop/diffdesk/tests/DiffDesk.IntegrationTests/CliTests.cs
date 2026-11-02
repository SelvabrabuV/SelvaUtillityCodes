using DiffDesk.Cli;
using DiffDesk.Domain;
using DiffDesk.Infrastructure;

namespace DiffDesk.IntegrationTests;

public class CliTests
{
    [Fact]
    public void VersionAndUnknownCommandUseThePublishedExitCodes()
    {
        var version = Run(["--version"]);
        Assert.Equal(0, version.Code);
        Assert.Contains("DiffDesk 1.0.0", version.Out);
        var unknown = Run(["nope"]);
        Assert.Equal(2, unknown.Code);
    }

    [Fact]
    public void Compare_ReturnsZeroWhenEqualAndOneWhenNot()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        File.WriteAllText(Path.Combine(left, "a.txt"), "same");
        File.WriteAllText(Path.Combine(right, "a.txt"), "same");
        var same = Run(["compare", left, right]);
        Assert.Equal(0, same.Code);

        File.WriteAllText(Path.Combine(right, "a.txt"), "changed");
        var different = Run(["compare", left, right, "--content"]);
        Assert.Equal(1, different.Code);
        Assert.Contains("Different", different.Out);
    }

    [Fact]
    public void TextAndReport_WriteDifferences()
    {
        using var dir = new TempDir();
        var left = Path.Combine(dir.Path, "left.txt");
        var right = Path.Combine(dir.Path, "right.txt");
        File.WriteAllText(left, "one\n");
        File.WriteAllText(right, "two\n");
        var text = Run(["text", left, right]);
        Assert.Equal(1, text.Code);
        Assert.Contains("@@ ", text.Out);

        var report = Path.Combine(dir.Path, "report.html");
        var leftDir = dir.Sub("left");
        var rightDir = dir.Sub("right");
        File.Copy(left, Path.Combine(leftDir, "a.txt"));
        File.Copy(right, Path.Combine(rightDir, "a.txt"));
        var html = Run(["report", leftDir, rightDir, "--format", "html", "--output", report, "--content"]);
        Assert.Equal(1, html.Code);
        Assert.Contains("a.txt", File.ReadAllText(report));
    }

    [Fact]
    public void Merge_RefusesUnresolvedOutputUnlessForced()
    {
        using var dir = new TempDir();
        var basePath = Path.Combine(dir.Path, "base.txt");
        var left = Path.Combine(dir.Path, "left.txt");
        var right = Path.Combine(dir.Path, "right.txt");
        var output = Path.Combine(dir.Path, "out.txt");
        File.WriteAllText(basePath, "a\n");
        File.WriteAllText(left, "L\n");
        File.WriteAllText(right, "R\n");
        var refused = Run(["merge", basePath, left, right, "--output", output]);
        Assert.Equal(3, refused.Code);
        Assert.False(File.Exists(output));

        var forced = Run(["merge", basePath, left, right, "--output", output, "--force"]);
        Assert.Equal(3, forced.Code);
        var body = File.ReadAllText(output);
        Assert.Contains("<<<<<<< LEFT", body);
        Assert.Contains(">>>>>>> RIGHT", body);
    }

    [Fact]
    public void Sync_DryRunDoesNotWriteAndExecuteCopies()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        File.WriteAllText(Path.Combine(left, "a.txt"), "from-left");
        var dry = Run(["sync", left, right]);
        Assert.Equal(0, dry.Code);
        Assert.Contains("Dry run", dry.Out);
        Assert.False(File.Exists(Path.Combine(right, "a.txt")));

        var executed = Run(["sync", left, right, "--execute"]);
        Assert.Equal(0, executed.Code);
        Assert.Equal("from-left", File.ReadAllText(Path.Combine(right, "a.txt")));
    }

    [Fact]
    public void Sessions_RoundTripPathsWithoutFileContents()
    {
        using var dir = new TempDir();
        var store = new JsonSessionRepository(Path.Combine(dir.Path, "sessions.json"));
        var settings = new JsonSettingsStore(Path.Combine(dir.Path, "settings.json"));
        var session = new SessionRecord
        {
            Id = "one",
            Name = "Notes",
            ComparisonType = "folder",
            LeftPath = @"D:\left",
            RightPath = @"D:\right",
            LastOpened = DateTimeOffset.UnixEpoch
        };
        store.Save(session);
        store.SaveWorkspace(new WorkspaceSnapshot([session], session.Id));
        var loaded = store.Find("one");
        Assert.Equal(@"D:\left", loaded?.LeftPath);
        var copy = store.Duplicate("one");
        Assert.NotEqual(session.Id, copy.Id);
        var export = Path.Combine(dir.Path, "session.json");
        store.Export(copy.Id, export);
        store.Delete(copy.Id);
        var imported = store.Import(export);
        Assert.Equal("folder", imported.ComparisonType);
        Assert.Equal(2, store.List().Count);
        var workspace = store.LoadWorkspace();
        Assert.Equal(session.Id, workspace?.SelectedId);

        settings.Save(new AppSettings { Theme = "Dark", RestoreTabs = false });
        Assert.Equal("Dark", settings.Load().Theme);
        Assert.False(settings.Load().RestoreTabs);
    }

    private static (int Code, string Out, string Error) Run(string[] args)
    {
        var output = new StringWriter();
        var error = new StringWriter();
        var previousOut = Console.Out;
        var previousError = Console.Error;
        try
        {
            Console.SetOut(output);
            Console.SetError(error);
            var code = new CliApp().Run(args);
            return (code, output.ToString(), error.ToString());
        }
        finally
        {
            Console.SetOut(previousOut);
            Console.SetError(previousError);
        }
    }
}
