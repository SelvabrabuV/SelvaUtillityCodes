using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Desktop.Services;
using DiffDesk.Domain;
using DiffDesk.Infrastructure;

namespace DiffDesk.Desktop.ViewModels;

public partial class FolderCompareViewModel : WorkspaceTab, ISessionTab, ICompareTab, ISaveTab, IDisposable
{
    private readonly IFolderComparisonService _folders = AppHost.Get<IFolderComparisonService>();
    private readonly IComparisonReportService _reports = AppHost.Get<IComparisonReportService>();
    private FolderComparisonResult? _last;
    private FolderWatch? _watch;

    public FolderCompareViewModel()
        : base("Folders", true)
    {
    }

    public ObservableCollection<FolderEntry> Entries { get; } = [];
    public Action<string, string?, string?>? OpenPair { get; set; }

    [ObservableProperty] private string _leftPath = "";
    [ObservableProperty] private string _rightPath = "";
    [ObservableProperty] private bool _compareSize = true;
    [ObservableProperty] private bool _compareTimestamp = true;
    [ObservableProperty] private bool _compareContent;
    [ObservableProperty] private bool _compareHash;
    [ObservableProperty] private bool _textAware;
    [ObservableProperty] private bool _differencesOnly;
    [ObservableProperty] private bool _useBuildExcludes;
    [ObservableProperty] private string _excludeText = "";
    [ObservableProperty] private string _summary = "Choose two folders. Size and time are compared. File contents are not read until you ask.";
    [ObservableProperty] private string _status = "";
    [ObservableProperty] private bool _busy;
    [ObservableProperty] private bool _stale;

    public Task CompareAsync() => Compare();

    [RelayCommand(CanExecute = nameof(CanRun))]
    private async Task Compare()
    {
        if (string.IsNullOrWhiteSpace(LeftPath) || string.IsNullOrWhiteSpace(RightPath))
        {
            Status = "Choose a left folder and a right folder.";
            return;
        }

        Busy = true;
        Status = "Comparing...";
        try
        {
            var progress = new Progress<ScanProgress>(update => Status = update.Seen + " items  " + update.CurrentPath);
            var result = await _folders.CompareAsync(LeftPath, RightPath, BuildRules(), BuildFilters(), progress, CancellationToken.None);
            _last = result;
            Entries.Clear();
            foreach (var entry in result.Entries)
                Entries.Add(entry);
            Summary = result.Summary;
            Status = result.FatalError ?? result.Summary;
            Stale = false;
            Rename("Folders");
            Arm();
        }
        catch (OperationCanceledException)
        {
            Status = "The comparison was cancelled.";
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException)
        {
            Status = ex.Message;
        }
        finally
        {
            Busy = false;
        }
    }

    [RelayCommand]
    private async Task BrowseLeftAsync()
    {
        var path = await Dialogs.Current.PickFolderAsync("Left folder");
        if (!string.IsNullOrWhiteSpace(path))
            LeftPath = path;
    }

    [RelayCommand]
    private async Task BrowseRightAsync()
    {
        var path = await Dialogs.Current.PickFolderAsync("Right folder");
        if (!string.IsNullOrWhiteSpace(path))
            RightPath = path;
    }

    [RelayCommand(CanExecute = nameof(HasResult))]
    private async Task SaveReportAsync()
    {
        if (_last is null)
        {
            Status = "Compare the folders before saving a report.";
            return;
        }

        var path = await Dialogs.Current.PickSaveFileAsync("Save report", "html");
        if (string.IsNullOrWhiteSpace(path))
            return;
        _reports.Write(path, _reports.BuildFolderReport(_last, ReportFormat.Html));
        Status = "Saved " + path;
    }

    public Task SaveAsync() => SaveReportAsync();

    public void Open(FolderEntry entry)
    {
        if (entry.Kind != EntryKind.File)
        {
            Status = entry.Kind == EntryKind.ReparsePoint
                ? "Reparse points are listed and skipped. They are not followed unless that option is on."
                : "Folders stay in this tree. Double-click a file to open it.";
            return;
        }

        string? left = entry.Status == CompareStatus.RightOnly ? null : Combine(LeftPath, entry.RelativePath);
        string? right = entry.Status == CompareStatus.LeftOnly ? null : Combine(RightPath, entry.RelativePath);
        var sample = left ?? right;
        if (sample is null)
            return;
        OpenPair?.Invoke(FileKind(sample), left, right);
    }

    public SessionRecord ToSession() => new()
    {
        Id = SessionId,
        Name = Label(),
        ComparisonType = "folder",
        LeftPath = LeftPath,
        RightPath = RightPath,
        Rules = BuildRules(),
        Filters = BuildFilters(),
        LastOpened = DateTimeOffset.Now
    };

    public async Task LoadAsync(SessionRecord session)
    {
        SessionId = session.Id;
        LeftPath = session.LeftPath ?? "";
        RightPath = session.RightPath ?? "";
        if (session.Rules is not null)
        {
            CompareSize = session.Rules.CompareSize;
            CompareTimestamp = session.Rules.CompareTimestamp;
            CompareContent = session.Rules.CompareContent;
            CompareHash = session.Rules.CompareHash;
            TextAware = session.Rules.TextAware;
        }

        if (session.Filters is not null)
        {
            DifferencesOnly = session.Filters.DifferencesOnly;
            ExcludeText = string.Join(Environment.NewLine, session.Filters.ExcludeGlobs);
        }

        if (!string.IsNullOrWhiteSpace(LeftPath) && !string.IsNullOrWhiteSpace(RightPath))
            await Compare();
    }

    public void Dispose() => _watch?.Dispose();

    partial void OnBusyChanged(bool value)
    {
        CompareCommand.NotifyCanExecuteChanged();
        SaveReportCommand.NotifyCanExecuteChanged();
    }

    private bool CanRun() => !Busy;
    private bool HasResult() => _last is not null && !Busy;

    private ComparisonRules BuildRules() => new()
    {
        CompareSize = CompareSize,
        CompareTimestamp = CompareTimestamp,
        CompareContent = CompareContent || CompareHash || TextAware,
        CompareHash = CompareHash,
        TextAware = TextAware
    };

    private FilterRules BuildFilters()
    {
        var filters = new FilterRules { DifferencesOnly = DifferencesOnly };
        if (UseBuildExcludes)
            filters.ExcludeGlobs.AddRange(FilterRules.CommonBuildExcludes);
        foreach (var line in ExcludeText.Split(['\r', '\n', ';'], StringSplitOptions.RemoveEmptyEntries))
            filters.ExcludeGlobs.Add(line.Trim());
        return filters;
    }

    private void Arm()
    {
        _watch?.Dispose();
        if (!Directory.Exists(LeftPath) || !Directory.Exists(RightPath))
            return;
        _watch = new FolderWatch(LeftPath, RightPath);
        _watch.Changed += (_, _) => Avalonia.Threading.Dispatcher.UIThread.Post(() =>
        {
            Stale = true;
            Status = "A folder changed. Compare again. The watcher is a hint, not the comparison.";
        });
    }

    private string Label()
    {
        var left = string.IsNullOrWhiteSpace(LeftPath) ? "Left" : Path.GetFileName(LeftPath.TrimEnd('\\', '/'));
        var right = string.IsNullOrWhiteSpace(RightPath) ? "Right" : Path.GetFileName(RightPath.TrimEnd('\\', '/'));
        return left + " and " + right;
    }

    private static string? Combine(string root, string relative)
    {
        try
        {
            return PathSafety.CombineUnderRoot(root, relative);
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private static string FileKind(string path) => Comparison.Routing.FileKindDetector.KindFor(path);
}
