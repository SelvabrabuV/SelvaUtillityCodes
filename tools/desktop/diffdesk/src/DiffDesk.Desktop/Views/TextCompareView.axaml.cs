using Avalonia.Controls;
using Avalonia.Interactivity;
using DiffDesk.Desktop.ViewModels;

namespace DiffDesk.Desktop.Views;

public partial class TextCompareView : UserControl
{
    private bool _searchRight;

    public TextCompareView() => InitializeComponent();

    private void FindClick(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not TextCompareViewModel view)
            return;
        var editor = _searchRight ? RightEditor : LeftEditor;
        if (!editor.FindNext(view.FindText))
        {
            _searchRight = !_searchRight;
            editor = _searchRight ? RightEditor : LeftEditor;
            if (!editor.FindNext(view.FindText))
                view.Status = "No match.";
        }
    }

    private void ReplaceClick(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not TextCompareViewModel view)
            return;
        var count = LeftEditor.ReplaceAll(view.FindText, view.ReplaceText) + RightEditor.ReplaceAll(view.FindText, view.ReplaceText);
        view.Status = count + " replacement(s). Compare again to refresh the hunks.";
    }
}
