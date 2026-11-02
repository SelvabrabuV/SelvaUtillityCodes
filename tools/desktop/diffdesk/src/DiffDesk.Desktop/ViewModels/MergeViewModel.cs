using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Comparison.Text;
using DiffDesk.Desktop.Services;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public sealed record PieceRow(int Id, string Kind, string Left, string Right, bool IsConflict);

public partial class MergeViewModel : WorkspaceTab, ISessionTab, ICompareTab, ISaveTab
{
    private readonly IThreeWayMergeService _merge = AppHost.Get<IThreeWayMergeService>();
    private readonly ITextFileStore _files = AppHost.Get<ITextFileStore>();
    private MergeResult? _current;
    private string _outputPath = "";

    public MergeViewModel()
        : base("Merge", true)
    {
    }

    public ObservableCollection<PieceRow> Pieces { get; } = [];

    [ObservableProperty] private string _basePath = "";
    [ObservableProperty] private string _leftPath = "";
    [ObservableProperty] private string _rightPath = "";
    [ObservableProperty] private string _rendered = "";
    [ObservableProperty] private string _status = "Choose the base, your file, and the other file. Conflicts stay marked until you choose a side.";
    [ObservableProperty] private PieceRow? _selectedPiece;
    [ObservableProperty] private int _conflictCount;

    public Task CompareAsync() => Merge();

    [RelayCommand]
    private async Task BrowseBaseAsync() => BasePath = await Pick(BasePath, "Base file");

    [RelayCommand]
    private async Task BrowseLeftAsync() => LeftPath = await Pick(LeftPath, "Left file");

    [RelayCommand]
    private async Task BrowseRightAsync() => RightPath = await Pick(RightPath, "Right file");

    [RelayCommand]
    private Task Merge()
    {
        if (string.IsNullOrWhiteSpace(BasePath) || string.IsNullOrWhiteSpace(LeftPath) || string.IsNullOrWhiteSpace(RightPath))
        {
            Status = "A three-way merge needs a base file, a left file, and a right file.";
            return Task.CompletedTask;
        }

        try
        {
            Show(_merge.Merge(_files.Read(BasePath).Text, _files.Read(LeftPath).Text, _files.Read(RightPath).Text, TextCompareOptions.Default));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            Status = ex.Message;
        }

        return Task.CompletedTask;
    }

    [RelayCommand(CanExecute = nameof(CanResolve))]
    private void ResolveLeft() => Resolve(MergeResolution.Left);

    [RelayCommand(CanExecute = nameof(CanResolve))]
    private void ResolveRight() => Resolve(MergeResolution.Right);

    [RelayCommand(CanExecute = nameof(CanResolve))]
    private void ResolveBoth() => Resolve(MergeResolution.Both);

    [RelayCommand]
    public async Task SaveAsync()
    {
        if (_current is null)
        {
            Status = "Merge the files before saving.";
            return;
        }

        if (_current.ConflictCount > 0)
        {
            var ok = await Dialogs.Current.ConfirmAsync(
                "Unresolved conflicts",
                _current.ConflictCount + " conflict(s) are still open. Saving writes the conflict markers into the file. Continue?");
            if (!ok)
                return;
        }

        if (string.IsNullOrWhiteSpace(_outputPath))
        {
            _outputPath = await Dialogs.Current.PickSaveFileAsync("Save merged file", "txt") ?? "";
            if (string.IsNullOrWhiteSpace(_outputPath))
                return;
        }

        var text = _merge.Render(_current, includeConflictMarkers: true);
        var sample = _files.Read(BasePath);
        _files.WriteAtomic(_outputPath, text, sample with { Text = text }, backup: true);
        Status = "Saved " + _outputPath + ".";
    }

    public SessionRecord ToSession() => new()
    {
        Id = SessionId,
        Name = "Merge",
        ComparisonType = "merge",
        BasePath = BasePath,
        LeftPath = LeftPath,
        RightPath = RightPath,
        OutputPath = _outputPath,
        LastOpened = DateTimeOffset.Now
    };

    public Task LoadAsync(SessionRecord session)
    {
        SessionId = session.Id;
        BasePath = session.BasePath ?? "";
        LeftPath = session.LeftPath ?? "";
        RightPath = session.RightPath ?? "";
        _outputPath = session.OutputPath ?? "";
        return Merge();
    }

    partial void OnSelectedPieceChanged(PieceRow? value)
    {
        ResolveLeftCommand.NotifyCanExecuteChanged();
        ResolveRightCommand.NotifyCanExecuteChanged();
        ResolveBothCommand.NotifyCanExecuteChanged();
    }

    private bool CanResolve() => SelectedPiece?.IsConflict == true && _current is not null;

    private void Resolve(MergeResolution resolution)
    {
        if (_current is null || SelectedPiece is null)
            return;
        Show(_merge.Resolve(_current, SelectedPiece.Id, resolution));
    }

    private void Show(MergeResult result)
    {
        _current = result;
        ConflictCount = result.ConflictCount;
        Rendered = result.RenderedText;
        Pieces.Clear();
        foreach (var piece in result.Pieces.Where(piece => piece.Kind != MergePieceKind.Unchanged))
        {
            Pieces.Add(new PieceRow(
                piece.Id,
                piece.Kind.ToString(),
                string.Join("\n", piece.LeftLines),
                string.Join("\n", piece.RightLines),
                piece.Kind == MergePieceKind.Conflict && !piece.Resolved));
        }

        Status = result.ConflictCount == 0
            ? "No conflicts remain."
            : result.ConflictCount + " conflict(s) remain. Choose left, right, or both. Nothing is saved until you save.";
        OnSelectedPieceChanged(SelectedPiece);
    }

    private static async Task<string> Pick(string current, string title)
    {
        var path = await Dialogs.Current.PickOpenFileAsync(title);
        return string.IsNullOrWhiteSpace(path) ? current : path;
    }
}
