using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public partial class SettingsViewModel : WorkspaceTab
{
    private readonly ISettingsStore _store = AppHost.Get<ISettingsStore>();
    private readonly Action<string> _applyTheme;

    public SettingsViewModel(Action<string> applyTheme)
        : base("Settings", true)
    {
        _applyTheme = applyTheme;
        var settings = _store.Load();
        Theme = settings.Theme;
        RestoreTabs = settings.RestoreTabs;
    }

    [ObservableProperty] private string _theme = "System";
    [ObservableProperty] private bool _restoreTabs = true;
    [ObservableProperty] private string _status = "Settings stay in %LOCALAPPDATA%\\DiffDesk. File contents are not stored.";

    public string[] Themes { get; } = ["System", "Light", "Dark"];

    [RelayCommand]
    private void Save()
    {
        var settings = _store.Load();
        settings.Theme = Theme;
        settings.RestoreTabs = RestoreTabs;
        _store.Save(settings);
        _applyTheme(Theme);
        Status = "Saved.";
    }
}
