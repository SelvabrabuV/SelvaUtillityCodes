using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using DiffDesk.Desktop.ViewModels;
using DiffDesk.Infrastructure;

namespace DiffDesk.Desktop;

public partial class App : Avalonia.Application
{
    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        try
        {
            DiffDeskLog.Init();
        }
        catch (IOException)
        {
        }

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var window = new Views.MainWindow();
            var shell = new ShellViewModel();
            window.DataContext = shell;
            if (shell.WindowWidth is > 640)
                window.Width = shell.WindowWidth.Value;
            if (shell.WindowHeight is > 480)
                window.Height = shell.WindowHeight.Value;
            desktop.MainWindow = window;
            shell.ApplyTheme();
        }

        base.OnFrameworkInitializationCompleted();
    }
}
