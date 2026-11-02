using Avalonia.Controls;
using Avalonia.Interactivity;

namespace DiffDesk.Desktop.Views;

public partial class ConfirmWindow : Window
{
    public ConfirmWindow()
    {
        InitializeComponent();
    }

    public ConfirmWindow(string title, string message)
        : this()
    {
        Title = title;
        MessageText.Text = message;
    }

    private void ContinueClick(object? sender, RoutedEventArgs e) => Close(true);

    private void CancelClick(object? sender, RoutedEventArgs e) => Close(false);
}
