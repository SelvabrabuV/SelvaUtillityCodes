using System.Collections.ObjectModel;
using Avalonia;
using Avalonia.Styling;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Comparison.Routing;
using DiffDesk.Desktop.Services;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public partial class ShellViewModel : ObservableObject
{
    private readonly HomeViewModel _home = new();
    private readonly ISettingsStore _settings = AppHost.Get<ISettingsStore>();
    private readonly ISessionRepository _sessions = AppHost.Get<ISessionRepository>();

    public ShellViewModel()
    {
        var stored = _settings.Load();
        Theme = string.IsNullOrWhiteSpace(stored.Theme) ? "System" : stored.Theme;
        WindowWidth = stored.WindowWidth;
        WindowHeight = stored.WindowHeight;
        _home.NewRequested += OpenNew;
        _home.OpenRequested += session => _ = OpenSessionAsync(session);
        Add(_home);
        if (stored.RestoreTabs)
            Restore();
        OpenLaunch();
    }

    public ObservableCollection<WorkspaceTab> Tabs { get; } = [];

    [ObservableProperty] private WorkspaceTab? _selected;
    [ObservableProperty] private string _status = "Files stay on this computer. Sync previews before it writes.";

    public string Theme { get; private set; }
    public double? WindowWidth { get; }
    public double? WindowHeight { get; }
    public bool CloseConfirmed { get; set; }
    public bool HasUnsavedText => Tabs.OfType<TextCompareViewModel>().Any(tab => tab.Dirty);

    [RelayCommand] private void NewFolder() => OpenNew("folder");
    [RelayCommand] private void NewText() => OpenNew("text");
    [RelayCommand] private void NewMerge() => OpenNew("merge");
    [RelayCommand] private void NewSync() => OpenNew("sync");
    [RelayCommand] private void NewImage() => OpenNew("image");
    [RelayCommand] private void NewTable() => OpenNew("table");
    [RelayCommand] private void NewBinary() => OpenNew("binary");
    [RelayCommand] private void NewJson() => OpenNew("json");
    [RelayCommand] private void NewXml() => OpenNew("xml");
    [RelayCommand] private void NewDocument() => OpenNew("document");
    [RelayCommand] private void NewSettings() => OpenNew("settings");

    [RelayCommand]
    private async Task OpenActiveAsync()
    {
        switch (Selected)
        {
            case FolderCompareViewModel folder:
                await folder.BrowseLeftCommand.ExecuteAsync(null);
                break;
            case TextCompareViewModel text:
                await text.BrowseLeftCommand.ExecuteAsync(null);
                break;
            case MergeViewModel merge:
                await merge.BrowseBaseCommand.ExecuteAsync(null);
                break;
            case SyncViewModel sync:
                await sync.BrowseLeftCommand.ExecuteAsync(null);
                break;
            case FileCompareViewModel file:
                await file.BrowseLeftCommand.ExecuteAsync(null);
                break;
            default:
                Status = "Open a comparison tab, then use Browse for the other path.";
                break;
        }
    }

    [RelayCommand]
    private async Task CompareActiveAsync()
    {
        if (Selected is ICompareTab tab)
            await tab.CompareAsync();
        else
            Status = "Choose a comparison tab. Home stores sessions and does not scan files.";
    }

    [RelayCommand]
    private async Task SaveActiveAsync()
    {
        if (Selected is ISaveTab tab)
            await tab.SaveAsync();
        else
            Status = "This tab has nothing to save.";
    }

    [RelayCommand]
    private void SaveSession()
    {
        if (Selected is not ISessionTab tab)
        {
            Status = "Open a comparison before saving a session.";
            return;
        }

        _sessions.Save(tab.ToSession());
        _home.Reload();
        Status = "Session saved under %LOCALAPPDATA%\\DiffDesk.";
    }

    [RelayCommand]
    private void NextTab()
    {
        if (Tabs.Count == 0 || Selected is null)
            return;
        var index = Tabs.IndexOf(Selected);
        Selected = Tabs[(index + 1) % Tabs.Count];
    }

    [RelayCommand]
    private void SetTheme(string theme) => ApplyTheme(theme);

    public void ApplyTheme() => ApplyTheme(Theme);

    public void ApplyTheme(string theme)
    {
        Theme = string.IsNullOrWhiteSpace(theme) ? "System" : theme;
        if (Avalonia.Application.Current is null)
            return;
        Avalonia.Application.Current.RequestedThemeVariant = Theme switch
        {
            "Light" => ThemeVariant.Light,
            "Dark" => ThemeVariant.Dark,
            _ => ThemeVariant.Default
        };
        var stored = _settings.Load();
        stored.Theme = Theme;
        _settings.Save(stored);
    }

    public void Persist(double width, double height)
    {
        var stored = _settings.Load();
        stored.WindowWidth = width;
        stored.WindowHeight = height;
        stored.Theme = Theme;
        _settings.Save(stored);
        if (!stored.RestoreTabs)
            return;
        var tabs = Tabs.OfType<ISessionTab>().Select(tab => tab.ToSession()).ToList();
        var selected = (Selected as ISessionTab)?.ToSession().Id;
        _sessions.SaveWorkspace(new WorkspaceSnapshot(tabs, selected));
    }

    private void OpenNew(string kind)
    {
        WorkspaceTab tab = kind switch
        {
            "folder" => new FolderCompareViewModel(),
            "text" => new TextCompareViewModel(),
            "merge" => new MergeViewModel(),
            "sync" => new SyncViewModel(),
            "settings" => new SettingsViewModel(ApplyTheme),
            _ => new FileCompareViewModel(kind)
        };
        Add(tab);
        Selected = tab;
        Status = tab.Title + " is ready.";
    }

    private async Task OpenSessionAsync(SessionRecord session)
    {
        var tab = Create(session.ComparisonType);
        if (tab is not ISessionTab sessionTab)
            return;
        Add(tab);
        Selected = tab;
        await sessionTab.LoadAsync(session);
        Status = "Opened " + session.Name + ".";
    }

    private void Restore()
    {
        WorkspaceSnapshot? snapshot;
        try
        {
            snapshot = _sessions.LoadWorkspace();
        }
        catch (System.Text.Json.JsonException)
        {
            return;
        }

        if (snapshot is null)
            return;
        foreach (var session in snapshot.Tabs)
            _ = OpenSessionAsync(session);
    }

    private void OpenLaunch()
    {
        if (string.IsNullOrWhiteSpace(Launch.Left))
            return;
        if (Launch.Files)
        {
            OpenFiles(FileKindDetector.KindFor(Launch.Left), Launch.Left, Launch.Right);
            return;
        }

        var folder = new FolderCompareViewModel { LeftPath = Launch.Left, RightPath = Launch.Right ?? "" };
        Add(folder);
        Selected = folder;
        if (!string.IsNullOrWhiteSpace(Launch.Right))
            _ = folder.CompareAsync();
    }

    private void OpenFiles(string kind, string? left, string? right)
    {
        if (kind == "text")
        {
            var text = new TextCompareViewModel();
            Add(text);
            Selected = text;
            _ = text.LoadAsync(new SessionRecord
            {
                Id = text.SessionId,
                Name = "Text",
                ComparisonType = "text",
                LeftPath = left,
                RightPath = right
            });
            return;
        }

        var file = new FileCompareViewModel(kind) { LeftPath = left ?? "", RightPath = right ?? "" };
        Add(file);
        Selected = file;
        if (!string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(right))
            _ = file.CompareAsync();
    }

    private async Task CloseAsync(WorkspaceTab tab)
    {
        if (!tab.CanClose)
            return;
        if (tab is TextCompareViewModel text && text.Dirty)
        {
            var ok = await Dialogs.Current.ConfirmAsync("Unsaved text", "Close this text comparison without saving the edits?");
            if (!ok)
                return;
        }

        if (tab is IDisposable disposable)
            disposable.Dispose();
        var index = Tabs.IndexOf(tab);
        Tabs.Remove(tab);
        if (Selected == tab)
            Selected = Tabs.Count == 0 ? null : Tabs[Math.Max(0, index - 1)];
    }

    private void Add(WorkspaceTab tab)
    {
        tab.RequestClose = new RelayCommand(() => _ = CloseAsync(tab));
        if (tab is FolderCompareViewModel folder)
            folder.OpenPair = OpenFiles;
        Tabs.Add(tab);
    }

    private WorkspaceTab Create(string kind) => kind switch
    {
        "folder" => new FolderCompareViewModel(),
        "text" => new TextCompareViewModel(),
        "merge" => new MergeViewModel(),
        "sync" => new SyncViewModel(),
        "settings" => new SettingsViewModel(ApplyTheme),
        "image" or "table" or "binary" or "json" or "xml" or "document" => new FileCompareViewModel(kind),
        _ => new FolderCompareViewModel()
    };
}
