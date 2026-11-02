using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public abstract partial class WorkspaceTab : ObservableObject
{
    protected WorkspaceTab(string title, bool canClose)
    {
        Title = title;
        CanClose = canClose;
    }

    public string Title { get; private set; }
    public bool CanClose { get; }
    public IRelayCommand? RequestClose { get; set; }
    public string SessionId { get; protected set; } = Guid.NewGuid().ToString("N");

    public void Rename(string title)
    {
        Title = title;
        OnPropertyChanged(nameof(Title));
    }
}

public interface ISessionTab
{
    SessionRecord ToSession();
    Task LoadAsync(SessionRecord session);
}

public interface ICompareTab
{
    Task CompareAsync();
}

public interface ISaveTab
{
    Task SaveAsync();
}
