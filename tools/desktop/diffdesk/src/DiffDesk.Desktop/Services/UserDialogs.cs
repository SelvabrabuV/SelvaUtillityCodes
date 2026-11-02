namespace DiffDesk.Desktop.Services;

public interface IUserDialogs
{
    Task<string?> PickFolderAsync(string title);
    Task<string?> PickOpenFileAsync(string title);
    Task<string?> PickSaveFileAsync(string title, string extension);
    Task<bool> ConfirmAsync(string title, string message);
}

public static class Dialogs
{
    public static IUserDialogs Current { get; set; } = new UnavailableDialogs();

    private sealed class UnavailableDialogs : IUserDialogs
    {
        public Task<string?> PickFolderAsync(string title) => Task.FromResult<string?>(null);
        public Task<string?> PickOpenFileAsync(string title) => Task.FromResult<string?>(null);
        public Task<string?> PickSaveFileAsync(string title, string extension) => Task.FromResult<string?>(null);
        public Task<bool> ConfirmAsync(string title, string message) => Task.FromResult(false);
    }
}
