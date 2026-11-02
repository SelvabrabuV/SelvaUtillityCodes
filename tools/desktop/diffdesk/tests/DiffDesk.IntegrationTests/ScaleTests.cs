using System.Diagnostics;
using DiffDesk.Comparison.Folder;
using DiffDesk.Domain;
using Xunit.Abstractions;

namespace DiffDesk.IntegrationTests;

public class ScaleTests
{
    private readonly ITestOutputHelper _output;

    public ScaleTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void MetadataScan_TwoThousandFiles()
    {
        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        for (var i = 0; i < 2000; i++)
        {
            var name = "f" + i.ToString("D4") + ".txt";
            File.WriteAllText(Path.Combine(left, name), "x");
            File.WriteAllText(Path.Combine(right, name), "x");
        }

        var watch = Stopwatch.StartNew();
        var result = new FolderComparer().Compare(left, right, ComparisonRules.Quick, FilterRules.Default, null, CancellationToken.None);
        watch.Stop();
        Assert.Null(result.FatalError);
        Assert.Equal(2000, result.Entries.Count);
        Assert.Equal(2000, result.Identical);
        var seconds = watch.Elapsed.TotalSeconds.ToString("0.000");
        _output.WriteLine("DIFFDESK_2000_SECONDS " + seconds);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(60), "The 2000-file metadata scan took " + seconds + "s.");
    }

    [Fact]
    public void OptionalLargeScans_RunOnlyWhenRequested()
    {
        if (Environment.GetEnvironmentVariable("DIFFDESK_PERF") != "1")
            return;

        using var dir = new TempDir();
        var left = dir.Sub("left");
        var right = dir.Sub("right");
        for (var i = 0; i < 10000; i++)
        {
            var name = "f" + i.ToString("D5") + ".txt";
            File.WriteAllText(Path.Combine(left, name), "x");
            File.WriteAllText(Path.Combine(right, name), i % 17 == 0 ? "y" : "x");
        }

        var watch = Stopwatch.StartNew();
        var result = new FolderComparer().Compare(left, right, ComparisonRules.Quick, FilterRules.Default, null, CancellationToken.None);
        watch.Stop();
        Assert.Null(result.FatalError);
        Assert.Equal(10000, result.Entries.Count);
        Assert.True(result.Different > 0);
        File.WriteAllText(Path.Combine(dir.Path, "elapsed-10k.txt"), watch.Elapsed.TotalSeconds.ToString("0.000"));
    }
}
