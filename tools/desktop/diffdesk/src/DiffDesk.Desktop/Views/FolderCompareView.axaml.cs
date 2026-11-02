using Avalonia.Controls;
using Avalonia.Input;
using DiffDesk.Desktop.ViewModels;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.Views;

public partial class FolderCompareView : UserControl
{
    public FolderCompareView() => InitializeComponent();

    private void RowDoubleTapped(object? sender, TappedEventArgs e)
    {
        if (DataContext is not FolderCompareViewModel view)
            return;
        if (Grid.SelectedItem is FolderEntry entry)
            view.Open(entry);
    }
}
