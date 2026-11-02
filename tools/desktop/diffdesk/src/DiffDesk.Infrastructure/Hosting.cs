using DiffDesk.Application;
using Microsoft.Extensions.DependencyInjection;
using DiffDesk.Comparison.Binary;
using DiffDesk.Comparison.Document;
using DiffDesk.Comparison.Folder;
using DiffDesk.Comparison.Image;
using DiffDesk.Comparison.Structured;
using DiffDesk.Comparison.Table;
using DiffDesk.Comparison.Text;
using DiffDesk.Domain;
using DiffDesk.Sync;
using Serilog;

namespace DiffDesk.Infrastructure;

public static class DiffDeskLog
{
    public static void Init()
    {
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .WriteTo.File(Path.Combine(AppLocations.Logs(), "diffdesk-.log"), rollingInterval: RollingInterval.Day)
            .CreateLogger();
    }
}

public sealed class FolderWatch : IDisposable
{
    private readonly FileSystemWatcher? _left;
    private readonly FileSystemWatcher? _right;
    private readonly System.Timers.Timer _timer = new(500) { AutoReset = false };
    private bool _disposed;

    public FolderWatch(string left, string right)
    {
        _left = Start(left);
        _right = Start(right);
        _timer.Elapsed += (_, _) => Changed?.Invoke(this, EventArgs.Empty);
    }

    public event EventHandler? Changed;

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;
        _timer.Dispose();
        _left?.Dispose();
        _right?.Dispose();
    }

    private FileSystemWatcher? Start(string path)
    {
        try
        {
            var watcher = new FileSystemWatcher(path)
            {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size,
                InternalBufferSize = 64 * 1024,
                EnableRaisingEvents = true
            };
            FileSystemEventHandler poke = (_, _) => Poke();
            watcher.Created += poke;
            watcher.Changed += poke;
            watcher.Deleted += poke;
            watcher.Renamed += (_, _) => Poke();
            watcher.Error += (_, _) => Changed?.Invoke(this, EventArgs.Empty);
            return watcher;
        }
        catch (Exception ex) when (ex is ArgumentException or IOException)
        {
            Log.Warning(ex, "File watching was not started for {Path}", path);
            return null;
        }
    }

    private void Poke()
    {
        _timer.Stop();
        _timer.Start();
    }
}

public static class DiffDeskServices
{
    public static IServiceProvider Build()
    {
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        services.AddSingleton<ITextDiffService, TextDiffService>();
        services.AddSingleton<IThreeWayMergeService, ThreeWayMergeService>();
        services.AddSingleton<ITextFileStore, TextFileCodec>();
        services.AddSingleton<IFolderComparisonService, FolderComparer>();
        services.AddSingleton<IStructuredDiffService, StructuredDiffService>();
        services.AddSingleton<ITableComparisonService, TableComparer>();
        services.AddSingleton<IImageComparisonService, ImageComparer>();
        services.AddSingleton<IBinaryComparisonService, BinaryComparer>();
        services.AddSingleton<IDocumentTextService, DocumentTextExtractor>();
        services.AddSingleton<IFileSystemService, PhysicalFileSystem>();
        services.AddSingleton<IBackupService, BackupService>();
        services.AddSingleton<ISynchronizationPlanner, SyncPlanner>();
        services.AddSingleton<ISynchronizationExecutor, SyncExecutor>();
        services.AddSingleton<IComparisonReportService, ComparisonReportService>();
        services.AddSingleton<ISessionRepository, JsonSessionRepository>();
        services.AddSingleton<ISettingsStore, JsonSettingsStore>();
        return services.BuildServiceProvider();
    }
}
