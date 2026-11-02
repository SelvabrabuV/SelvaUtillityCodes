using DiffDesk.Domain;
using DiffDesk.Infrastructure;
using Serilog;

namespace DiffDesk.Cli;

public static class Program
{
    public const int Same = 0;
    public const int Differences = 1;
    public const int Failure = 2;
    public const int Conflicts = 3;

    public static int Main(string[] args)
    {
        try
        {
            DiffDeskLog.Init();
            return new CliApp().Run(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            Log.Error(ex, "DiffDesk command failed");
            return Failure;
        }
    }
}

public sealed class CliApp
{
    private readonly IServiceProvider _services;

    public CliApp()
        : this(DiffDeskServices.Build())
    {
    }

    public CliApp(IServiceProvider services) => _services = services;

    public int Run(string[] args)
    {
        if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
        {
            Console.WriteLine(Help());
            return Program.Same;
        }

        if (args[0] is "--version" or "version")
        {
            Console.WriteLine("DiffDesk 1.0.0");
            return Program.Same;
        }

        return args[0] switch
        {
            "compare" => Compare(args),
            "text" => Text(args),
            "report" => Report(args),
            "sync" => Sync(args),
            "merge" => Merge(args),
            _ => Fail("Unknown command. Run diffdesk --help.")
        };
    }

    private int Compare(string[] args)
    {
        if (!TryPair(args, out var left, out var right))
            return Program.Failure;
        var rules = ComparisonRules.Quick;
        if (Has(args, "--content"))
            rules = rules with { CompareContent = true };
        if (Has(args, "--hash"))
            rules = rules with { CompareHash = true, CompareContent = true };
        if (Has(args, "--text"))
            rules = rules with { TextAware = true };
        var filters = new FilterRules();
        foreach (var pattern in Values(args, "--exclude"))
            filters.ExcludeGlobs.Add(pattern);
        var result = Folder().CompareAsync(left, right, rules, filters, null, CancellationToken.None).GetAwaiter().GetResult();
        if (!string.IsNullOrEmpty(result.FatalError))
            return Fail(result.FatalError);
        Console.WriteLine(result.Summary);
        foreach (var entry in result.Entries.Where(static entry => entry.Status != CompareStatus.Identical))
            Console.WriteLine($"{entry.Status}\t{entry.RelativePath}");
        return result.Different + result.LeftOnly + result.RightOnly + result.Errors > 0 ? Program.Differences : Program.Same;
    }

    private int Text(string[] args)
    {
        if (!TryPair(args, out var left, out var right))
            return Program.Failure;
        var options = Options(args);
        var diff = TextDiff().Compare(Read(left), Read(right), options);
        Console.Write(TextDiff().ToUnified(left, right, diff));
        return diff.Identical ? Program.Same : Program.Differences;
    }

    private int Report(string[] args)
    {
        if (!TryPair(args, out var left, out var right))
            return Program.Failure;
        var format = Format(Value(args, "--format") ?? "text");
        var rules = Has(args, "--content") ? ComparisonRules.WithContent : ComparisonRules.Quick;
        var result = Folder().CompareAsync(left, right, rules, FilterRules.Default, null, CancellationToken.None).GetAwaiter().GetResult();
        var body = Reports().BuildFolderReport(result, format);
        var output = Value(args, "--output");
        if (string.IsNullOrEmpty(output))
            Console.WriteLine(body);
        else
            Reports().Write(output, body);
        return string.IsNullOrEmpty(result.FatalError) && result.Different + result.LeftOnly + result.RightOnly + result.Errors == 0
            ? Program.Same
            : string.IsNullOrEmpty(result.FatalError) ? Program.Differences : Program.Failure;
    }

    private int Sync(string[] args)
    {
        if (!TryPair(args, out var left, out var right))
            return Program.Failure;
        var mode = (Value(args, "--mode") ?? "update-right") switch
        {
            "mirror-right" => SyncMode.MirrorLeftToRight,
            "mirror-left" => SyncMode.MirrorRightToLeft,
            "update-left" => SyncMode.UpdateLeftFromRight,
            "two-way" => SyncMode.TwoWay,
            _ => SyncMode.UpdateRightFromLeft
        };
        var comparison = Folder().CompareAsync(left, right, ComparisonRules.WithContent, FilterRules.Default, null, CancellationToken.None).GetAwaiter().GetResult();
        var plan = Planner().Plan(comparison, mode);
        Console.WriteLine($"Copy {plan.CopyCount}, update {plan.UpdateCount}, delete {plan.DeleteCount}, conflict {plan.ConflictCount}, skip {plan.SkipCount}.");
        if (!string.IsNullOrEmpty(plan.BlockingError))
            return Fail(plan.BlockingError);
        foreach (var operation in plan.Operations.Where(static operation => operation.Action != SyncAction.Skip))
            Console.WriteLine($"{operation.Action}\t{operation.Direction}\t{operation.RelativePath}\t{operation.Detail}");
        if (!Has(args, "--execute"))
        {
            Console.WriteLine("Dry run. Pass --execute to apply the plan.");
            return plan.ConflictCount > 0 ? Program.Conflicts : Program.Same;
        }

        if (plan.DeleteCount > 0 && !Has(args, "--confirm-deletes"))
            return Fail("This plan deletes files. Pass --confirm-deletes after reading the dry run.");
        var executed = Executor().ExecuteAsync(plan, new SyncExecuteOptions
        {
            AllowDeletes = Has(args, "--confirm-deletes"),
            MakeBackups = true,
            RecoveryRoot = AppLocations.Recovery()
        }, null, CancellationToken.None).GetAwaiter().GetResult();
        var errors = executed.Results.Count(static result => result.Outcome is "Error" or "Conflict");
        Console.WriteLine($"Done in {executed.Elapsed.TotalSeconds:0.0}s, {executed.BytesTransferred} bytes, journal {executed.JournalPath}.");
        return errors > 0 ? Program.Failure : Program.Same;
    }

    private int Merge(string[] args)
    {
        if (args.Length < 4)
            return Fail("Usage: diffdesk merge <base> <left> <right> --output <file>");
        var merged = Merger().Merge(Read(args[1]), Read(args[2]), Read(args[3]), Options(args));
        Console.WriteLine($"{merged.ConflictCount} conflict(s).");
        var output = Value(args, "--output");
        if (merged.ConflictCount > 0 && !Has(args, "--force"))
        {
            Console.Error.WriteLine("Conflicts remain. Pass --force to write the file with conflict markers.");
            return Program.Conflicts;
        }
        if (!string.IsNullOrEmpty(output))
        {
            var rendered = Merger().Render(merged, includeConflictMarkers: true);
            Reports().Write(output, rendered);
        }
        else
        {
            Console.WriteLine(merged.RenderedText);
        }

        return merged.ConflictCount > 0 ? Program.Conflicts : Program.Same;
    }

    private static TextCompareOptions Options(string[] args) => new()
    {
        IgnoreCase = Has(args, "--ignore-case"),
        IgnoreWhitespace = Has(args, "--ignore-whitespace"),
        IgnoreBlankLines = Has(args, "--ignore-blank-lines"),
        NormalizeLineEndings = true
    };

    private static bool TryPair(string[] args, out string left, out string right)
    {
        left = "";
        right = "";
        if (args.Length < 3)
        {
            Console.Error.WriteLine("Two paths are required.");
            return false;
        }

        left = args[1];
        right = args[2];
        return true;
    }

    private static string Read(string path) => File.ReadAllText(path);

    private static int Fail(string message)
    {
        Console.Error.WriteLine(message);
        return Program.Failure;
    }

    private static bool Has(string[] args, string name) => args.Any(arg => arg.Equals(name, StringComparison.OrdinalIgnoreCase));

    private static string? Value(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }

        return null;
    }

    private static IEnumerable<string> Values(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                yield return args[i + 1];
        }
    }

    private static ReportFormat Format(string value) => value.ToLowerInvariant() switch
    {
        "json" => ReportFormat.Json,
        "csv" => ReportFormat.Csv,
        "html" => ReportFormat.Html,
        _ => ReportFormat.Text
    };

    private IFolderComparisonService Folder() => (IFolderComparisonService)_services.GetService(typeof(IFolderComparisonService))!;
    private ITextDiffService TextDiff() => (ITextDiffService)_services.GetService(typeof(ITextDiffService))!;
    private IThreeWayMergeService Merger() => (IThreeWayMergeService)_services.GetService(typeof(IThreeWayMergeService))!;
    private ISynchronizationPlanner Planner() => (ISynchronizationPlanner)_services.GetService(typeof(ISynchronizationPlanner))!;
    private ISynchronizationExecutor Executor() => (ISynchronizationExecutor)_services.GetService(typeof(ISynchronizationExecutor))!;
    private IComparisonReportService Reports() => (IComparisonReportService)_services.GetService(typeof(IComparisonReportService))!;

    public static string Help() => """
        DiffDesk compares files and folders on this computer. Nothing is uploaded.

        diffdesk compare <left> <right> [--content] [--hash] [--text] [--exclude <glob>]
        diffdesk text <left> <right> [--ignore-case] [--ignore-whitespace] [--ignore-blank-lines]
        diffdesk report <left> <right> --format text|json|csv|html [--output <file>] [--content]
        diffdesk sync <left> <right> --mode update-right|update-left|mirror-right|mirror-left|two-way [--execute] [--confirm-deletes]
        diffdesk merge <base> <left> <right> [--output <file>] [--force]

        Exit codes:
          0  same, or a dry run with no conflicts
          1  differences found
          2  the command failed
          3  merge or sync conflicts remain

        sync prints a dry run unless you pass --execute. Mirror deletes need --confirm-deletes.
        """;
}
