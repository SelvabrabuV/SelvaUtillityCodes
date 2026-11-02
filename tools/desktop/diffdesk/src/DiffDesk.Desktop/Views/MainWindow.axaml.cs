using Avalonia.Controls;
using Avalonia.Platform.Storage;
using DiffDesk.Desktop.Services;
using DiffDesk.Desktop.ViewModels;

namespace DiffDesk.Desktop.Views;

public partial class MainWindow : Window, IUserDialogs
{
    public MainWindow()
    {
        InitializeComponent();
        Dialogs.Current = this;
    }

    protected override async void OnClosing(WindowClosingEventArgs e)
    {
        if (DataContext is not ShellViewModel shell)
        {
            base.OnClosing(e);
            return;
        }

        if (shell.HasUnsavedText && !shell.CloseConfirmed)
        {
            e.Cancel = true;
            var ok = await ConfirmAsync("Unsaved text", "Close DiffDesk without saving the text edits?");
            if (!ok)
                return;
            shell.CloseConfirmed = true;
            Close();
            return;
        }

        shell.Persist(Width, Height);
        base.OnClosing(e);
    }

    public async Task<string?> PickFolderAsync(string title)
    {
        var folders = await StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions { Title = title, AllowMultiple = false });
        return folders.Count == 0 ? null : folders[0].TryGetLocalPath();
    }

    public async Task<string?> PickOpenFileAsync(string title)
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = title,
            AllowMultiple = false
        });
        return files.Count == 0 ? null : files[0].TryGetLocalPath();
    }

    public async Task<string?> PickSaveFileAsync(string title, string extension)
    {
        var file = await StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions
        {
            Title = title,
            DefaultExtension = extension,
            FileTypeChoices = [new FilePickerFileType(extension) { Patterns = ["*." + extension] }]
        });
        return file?.TryGetLocalPath();
    }

    public async Task<bool> ConfirmAsync(string title, string message)
    {
        var window = new ConfirmWindow(title, message);
        return await window.ShowDialog<bool>(this);
    }
}
