using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Desktop.Services;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public sealed partial class SyncRow : ObservableObject
{
    public SyncRow(SyncOperation operation, FolderEntry entry)
    {
        Operation = operation;
        Entry = entry;
        Selected = operation.Selected;
    }

    public SyncOperation Operation { get; }
    public FolderEntry Entry { get; }
    public string RelativePath => Operation.RelativePath;
    public string ActionText => Operation.Action.ToString();
    public string DirectionText => Operation.Direction.ToString();
    public string Detail => Operation.Detail ?? "";

    [ObservableProperty]
    private bool _selected;

    partial void OnSelectedChanged(bool value) => Operation.Selected = value;

    public void Use(bool leftSide)
    {
        var takeLeft = leftSide;
        if (takeLeft && Entry.Status == CompareStatus.RightOnly || !takeLeft && Entry.Status == CompareStatus.LeftOnly)
        {
            Operation.Action = SyncAction.Delete;
            Operation.Direction = SyncDirection.None;
            Operation.RequiresConfirmation = true;
            Operation.SourceLength = takeLeft ? Entry.RightLength : Entry.LeftLength;
            Operation.SourceModified = takeLeft ? Entry.RightModified : Entry.LeftModified;
            Operation.Detail = "Delete the side that the chosen folder does not have.";
        }
        else if (Entry.Kind == EntryKind.Directory)
        {
            Operation.Action = SyncAction.Skip;
            Operation.Direction = SyncDirection.None;
            Operation.Detail = "Both folders exist.";
        }
        else if (takeLeft && Entry.Status == CompareStatus.LeftOnly || !takeLeft && Entry.Status == CompareStatus.RightOnly)
        {
            Operation.Action = SyncAction.Copy;
            Operation.Direction = takeLeft ? SyncDirection.LeftToRight : SyncDirection.RightToLeft;
            AssignLengths(takeLeft);
            Operation.Detail = null;
        }
        else
        {
            Operation.Action = SyncAction.Update;
            Operation.Direction = takeLeft ? SyncDirection.LeftToRight : SyncDirection.RightToLeft;
            AssignLengths(takeLeft);
            Operation.Detail = "Use the chosen side.";
        }

        Operation.Status = Operation.Action == SyncAction.Skip ? "No change" : "Pending";
        Selected = Operation.Action is SyncAction.Copy or SyncAction.Update or SyncAction.Delete;
        OnPropertyChanged(nameof(ActionText));
        OnPropertyChanged(nameof(DirectionText));
        OnPropertyChanged(nameof(Detail));
    }

    public void Skip()
    {
        Operation.Action = SyncAction.Skip;
        Operation.Selected = false;
        Selected = false;
        Operation.Detail = "Skipped.";
        OnPropertyChanged(nameof(ActionText));
        OnPropertyChanged(nameof(Detail));
    }

    private void AssignLengths(bool takeLeft)
    {
        Operation.SourceLength = takeLeft ? Entry.LeftLength : Entry.RightLength;
        Operation.SourceModified = takeLeft ? Entry.LeftModified : Entry.RightModified;
        Operation.DestinationLength = takeLeft ? Entry.RightLength : Entry.LeftLength;
        Operation.DestinationModified = takeLeft ? Entry.RightModified : Entry.LeftModified;
    }
}

public partial class SyncViewModel : WorkspaceTab, ISessionTab, ICompareTab, ISaveTab
{
    private readonly IFolderComparisonService _folders = AppHost.Get<IFolderComparisonService>();
    private readonly ISynchronizationPlanner _planner = AppHost.Get<ISynchronizationPlanner>();
    private readonly ISynchronizationExecutor _executor = AppHost.Get<ISynchronizationExecutor>();
    private string? _journal;

    public SyncViewModel()
        : base("Sync", true)
    {
        SelectedMode = Modes[0];
    }

    public IReadOnlyList<ModeChoice> Modes { get; } =
    [
        new("Update right from left", SyncMode.UpdateRightFromLeft),
        new("Update left from right", SyncMode.UpdateLeftFromRight),
        new("Mirror left to right", SyncMode.MirrorLeftToRight),
        new("Mirror right to left", SyncMode.MirrorRightToLeft),
        new("Two-way", SyncMode.TwoWay)
    ];

    public ObservableCollection<SyncRow> Rows { get; } = [];

    [ObservableProperty] private string _leftPath = "";
    [ObservableProperty] private string _rightPath = "";
    [ObservableProperty] private ModeChoice? _selectedMode;
    [ObservableProperty] private SyncRow? _selectedRow;
    [ObservableProperty] private string _status = "Preview builds a plan and does not change files. Execute is a separate step.";
    [ObservableProperty] private bool _busy;
    [ObservableProperty] private bool _hasPlan;

    public Task CompareAsync() => Preview();
    public Task SaveAsync() => Task.CompletedTask;

    [RelayCommand]
    private async Task BrowseLeftAsync()
    {
        var path = await Dialogs.Current.PickFolderAsync("Left folder");
        if (!string.IsNullOrWhiteSpace(path))
            LeftPath = path;
    }

    [RelayCommand]
    private async Task BrowseRightAsync()
    {
        var path = await Dialogs.Current.PickFolderAsync("Right folder");
        if (!string.IsNullOrWhiteSpace(path))
            RightPath = path;
    }

    [RelayCommand(CanExecute = nameof(CanRun))]
    private async Task Preview()
    {
        if (string.IsNullOrWhiteSpace(LeftPath) || string.IsNullOrWhiteSpace(RightPath) || SelectedMode is null)
        {
            Status = "Choose two folders that do not contain each other.";
            return;
        }

        Busy = true;
        try
        {
            var comparison = await _folders.CompareAsync(LeftPath, RightPath, ComparisonRules.WithContent, FilterRules.Default, null, CancellationToken.None);
            var plan = _planner.Plan(comparison, SelectedMode.Mode);
            Rows.Clear();
            var byPath = comparison.Entries.ToDictionary(entry => entry.RelativePath, StringComparer.OrdinalIgnoreCase);
            foreach (var operation in plan.Operations)
            {
                if (!byPath.TryGetValue(operation.RelativePath, out var entry))
                    continue;
                Rows.Add(new SyncRow(operation, entry));
            }

            HasPlan = true;
            Status = plan.BlockingError
                ?? "Copy " + plan.CopyCount + ", update " + plan.UpdateCount + ", delete " + plan.DeleteCount + ", conflict " + plan.ConflictCount + ", skip " + plan.SkipCount + ". This is a preview.";
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException)
        {
            Status = ex.Message;
        }
        finally
        {
            Busy = false;
        }
    }

    [RelayCommand(CanExecute = nameof(CanExecutePlan))]
    private async Task Execute()
    {
        if (SelectedMode is null || Rows.Count == 0)
            return;
        var selected = Rows.Where(row => row.Selected && row.Operation.Action != SyncAction.Skip).Select(row => row.Operation).ToList();
        var deletes = selected.Count(operation => operation.Action == SyncAction.Delete);
        var allowDeletes = false;
        if (deletes > 0)
        {
            allowDeletes = await Dialogs.Current.ConfirmAsync(
                "Delete files",
                deletes + " selected item(s) will be deleted. Files are copied into the recovery folder first. A folder is removed only when it is empty. This cannot be silent.");
            if (!allowDeletes)
            {
                Status = "Execute was not started. Deletes stay in the plan until you confirm them or skip them.";
                return;
            }
        }

        Busy = true;
        try
        {
            var plan = new SyncPlan
            {
                Mode = SelectedMode.Mode,
                LeftRoot = LeftPath,
                RightRoot = RightPath,
                Operations = selected
            };
            var executed = await _executor.ExecuteAsync(plan, new SyncExecuteOptions
            {
                AllowDeletes = allowDeletes,
                MakeBackups = true,
                RecoveryRoot = Infrastructure.AppLocations.Recovery()
            }, null, CancellationToken.None);
            _journal = executed.JournalPath;
            var errors = executed.Results.Count(result => result.Outcome is "Error" or "Conflict");
            Status = "Finished. " + executed.BytesTransferred + " bytes. " + errors + " problem(s). Journal: " + executed.JournalPath;
            await Preview();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            Status = ex.Message;
        }
        finally
        {
            Busy = false;
        }
    }

    [RelayCommand(CanExecute = nameof(CanUndo))]
    private async Task Undo()
    {
        if (string.IsNullOrWhiteSpace(_journal))
        {
            Status = "There is no journal from this session to undo.";
            return;
        }

        var count = await _executor.UndoAsync(_journal, CancellationToken.None);
        Status = "Restored " + count + " item(s) from the journal.";
        await Preview();
    }

    [RelayCommand]
    private void UseLeft() => SelectedRow?.Use(true);

    [RelayCommand]
    private void UseRight() => SelectedRow?.Use(false);

    [RelayCommand]
    private void Skip() => SelectedRow?.Skip();

    public SessionRecord ToSession() => new()
    {
        Id = SessionId,
        Name = "Sync",
        ComparisonType = "sync",
        LeftPath = LeftPath,
        RightPath = RightPath,
        Layout = SelectedMode?.Mode.ToString(),
        LastOpened = DateTimeOffset.Now
    };

    public Task LoadAsync(SessionRecord session)
    {
        SessionId = session.Id;
        LeftPath = session.LeftPath ?? "";
        RightPath = session.RightPath ?? "";
        var match = Modes.FirstOrDefault(mode => mode.Mode.ToString() == session.Layout);
        if (match is not null)
            SelectedMode = match;
        return Preview();
    }

    partial void OnBusyChanged(bool value)
    {
        PreviewCommand.NotifyCanExecuteChanged();
        ExecuteCommand.NotifyCanExecuteChanged();
        UndoCommand.NotifyCanExecuteChanged();
    }

    partial void OnHasPlanChanged(bool value) => ExecuteCommand.NotifyCanExecuteChanged();

    private bool CanRun() => !Busy;
    private bool CanExecutePlan() => !Busy && HasPlan;
    private bool CanUndo() => !Busy && !string.IsNullOrWhiteSpace(_journal);
}

public sealed record ModeChoice(string Label, SyncMode Mode);
