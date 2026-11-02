using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Domain;
using DiffDesk.Infrastructure;

namespace DiffDesk.Desktop.ViewModels;

public partial class HomeViewModel : WorkspaceTab
{
    private readonly ISessionRepository _sessions;

    public HomeViewModel()
        : base("Home", false)
    {
        _sessions = AppHost.Get<ISessionRepository>();
        Refresh();
    }

    public ObservableCollection<SessionRecord> Sessions { get; } = [];

    [ObservableProperty]
    private SessionRecord? _selectedSession;
    public event Action<string>? NewRequested;
    public event Action<SessionRecord>? OpenRequested;

    [RelayCommand] private void NewFolder() => NewRequested?.Invoke("folder");
    [RelayCommand] private void NewText() => NewRequested?.Invoke("text");
    [RelayCommand] private void NewMerge() => NewRequested?.Invoke("merge");
    [RelayCommand] private void NewSync() => NewRequested?.Invoke("sync");
    [RelayCommand] private void NewImage() => NewRequested?.Invoke("image");
    [RelayCommand] private void NewTable() => NewRequested?.Invoke("table");
    [RelayCommand] private void NewBinary() => NewRequested?.Invoke("binary");
    [RelayCommand] private void NewJson() => NewRequested?.Invoke("json");
    [RelayCommand] private void NewXml() => NewRequested?.Invoke("xml");
    [RelayCommand] private void NewDocument() => NewRequested?.Invoke("document");
    [RelayCommand] private void NewSettings() => NewRequested?.Invoke("settings");

    public void Reload()
    {
        Sessions.Clear();
        foreach (var session in _sessions.List())
            Sessions.Add(session);
    }

    [RelayCommand]
    private void Refresh() => Reload();

    [RelayCommand]
    private void Open()
    {
        if (SelectedSession is not null)
            OpenRequested?.Invoke(SelectedSession);
    }

    [RelayCommand]
    private void Duplicate()
    {
        if (SelectedSession is null)
            return;
        _sessions.Duplicate(SelectedSession.Id);
        Reload();
    }

    [RelayCommand]
    private void Delete()
    {
        if (SelectedSession is null)
            return;
        _sessions.Delete(SelectedSession.Id);
        SelectedSession = null;
        Reload();
    }

    [RelayCommand]
    private async Task ExportAsync()
    {
        if (SelectedSession is null)
            return;
        var path = await Services.Dialogs.Current.PickSaveFileAsync("Export session", "json");
        if (string.IsNullOrWhiteSpace(path))
            return;
        _sessions.Export(SelectedSession.Id, path);
    }

    [RelayCommand]
    private async Task ImportAsync()
    {
        var path = await Services.Dialogs.Current.PickOpenFileAsync("Import session");
        if (string.IsNullOrWhiteSpace(path))
            return;
        _sessions.Import(path);
        Reload();
    }
}
