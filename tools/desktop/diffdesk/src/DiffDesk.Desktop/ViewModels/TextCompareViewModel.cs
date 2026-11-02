using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DiffDesk.Comparison.Text;
using DiffDesk.Desktop.Services;
using DiffDesk.Domain;

namespace DiffDesk.Desktop.ViewModels;

public sealed record HunkRow(int Id, int LeftStart, int LeftCount, int RightStart, int RightCount, string LeftPreview, string RightPreview, TextHunk Hunk);

public partial class TextCompareViewModel : WorkspaceTab, ISessionTab, ICompareTab, ISaveTab
{
    private readonly ITextDiffService _diff = AppHost.Get<ITextDiffService>();
    private readonly ITextFileStore _files = AppHost.Get<ITextFileStore>();
    private LoadedText? _leftLoaded;
    private LoadedText? _rightLoaded;
    private bool _suspend;
    private bool _leftDirty;
    private bool _rightDirty;

    public TextCompareViewModel()
        : base("Text", true)
    {
    }

    public ObservableCollection<HunkRow> Hunks { get; } = [];

    [ObservableProperty] private string _leftPath = "";
    [ObservableProperty] private string _rightPath = "";
    [ObservableProperty] private string _leftText = "";
    [ObservableProperty] private string _rightText = "";
    [ObservableProperty] private bool _ignoreCase;
    [ObservableProperty] private bool _ignoreWhitespace;
    [ObservableProperty] private bool _ignoreBlankLines;
    [ObservableProperty] private string _status = "Open two text files. Editing does not recompute the diff until you compare again.";
    [ObservableProperty] private bool _stale;
    [ObservableProperty] private bool _dirty;
    [ObservableProperty] private HunkRow? _selectedHunk;
    [ObservableProperty] private string _findText = "";
    [ObservableProperty] private string _replaceText = "";

    public Task CompareAsync()
    {
        Compare();
        return Task.CompletedTask;
    }

    [RelayCommand]
    private void Compare()
    {
        var result = _diff.Compare(LeftText, RightText, Options());
        Hunks.Clear();
        foreach (var hunk in result.Hunks)
        {
            Hunks.Add(new HunkRow(
                hunk.Id,
                hunk.LeftStart + 1,
                hunk.LeftCount,
                hunk.RightStart + 1,
                hunk.RightCount,
                Preview(hunk.LeftLines),
                Preview(hunk.RightLines),
                hunk));
        }

        Stale = false;
        Status = result.Identical
            ? "The texts match."
            : result.Added + " added, " + result.Removed + " removed, " + result.Modified + " modified.";
    }

    [RelayCommand]
    private async Task BrowseLeftAsync() => LeftPath = await LoadSide(LeftPath, true) ?? LeftPath;

    [RelayCommand]
    private async Task BrowseRightAsync() => RightPath = await LoadSide(RightPath, false) ?? RightPath;

    [RelayCommand(CanExecute = nameof(CanApply))]
    private void CopyToRight()
    {
        if (SelectedHunk is null)
            return;
        var split = TextLines.Split(RightText);
        RightText = _diff.ApplyHunk(RightText, SelectedHunk.Hunk.RightStart, SelectedHunk.Hunk.RightCount, SelectedHunk.Hunk.LeftLines, split.NewLine, split.EndsWithNewLine);
        Stale = true;
        Status = "Copied that change to the right. Compare again before the next hunk. The line numbers belong to the last comparison.";
    }

    [RelayCommand(CanExecute = nameof(CanApply))]
    private void CopyToLeft()
    {
        if (SelectedHunk is null)
            return;
        var split = TextLines.Split(LeftText);
        LeftText = _diff.ApplyHunk(LeftText, SelectedHunk.Hunk.LeftStart, SelectedHunk.Hunk.LeftCount, SelectedHunk.Hunk.RightLines, split.NewLine, split.EndsWithNewLine);
        Stale = true;
        Status = "Copied that change to the left. Compare again before the next hunk.";
    }

    [RelayCommand]
    private async Task SaveLeftAsync() => await SaveSide(true);

    [RelayCommand]
    private async Task SaveRightAsync() => await SaveSide(false);

    public async Task SaveAsync()
    {
        if (_leftDirty)
            await SaveSide(true);
        if (_rightDirty)
            await SaveSide(false);
        if (!_leftDirty && !_rightDirty)
            Status = "Nothing has changed since the files were loaded.";
    }

    public SessionRecord ToSession() => new()
    {
        Id = SessionId,
        Name = "Text",
        ComparisonType = "text",
        LeftPath = LeftPath,
        RightPath = RightPath,
        LastOpened = DateTimeOffset.Now
    };

    public Task LoadAsync(SessionRecord session)
    {
        SessionId = session.Id;
        if (!string.IsNullOrWhiteSpace(session.LeftPath))
            ReadInto(session.LeftPath, true);
        if (!string.IsNullOrWhiteSpace(session.RightPath))
            ReadInto(session.RightPath, false);
        Compare();
        return Task.CompletedTask;
    }

    partial void OnLeftTextChanged(string value) => Mark(true);
    partial void OnRightTextChanged(string value) => Mark(false);
    partial void OnSelectedHunkChanged(HunkRow? value) => RefreshApply();
    partial void OnStaleChanged(bool value) => RefreshApply();

    private void Mark(bool left)
    {
        if (_suspend)
            return;
        if (left)
            _leftDirty = true;
        else
            _rightDirty = true;
        Dirty = _leftDirty || _rightDirty;
        Stale = true;
    }

    private bool CanApply() => SelectedHunk is not null && !Stale;

    private void RefreshApply()
    {
        CopyToRightCommand.NotifyCanExecuteChanged();
        CopyToLeftCommand.NotifyCanExecuteChanged();
    }

    private async Task<string?> LoadSide(string current, bool left)
    {
        var path = await Dialogs.Current.PickOpenFileAsync(left ? "Left file" : "Right file");
        if (string.IsNullOrWhiteSpace(path))
            return current;
        ReadInto(path, left);
        return path;
    }

    private void ReadInto(string path, bool left)
    {
        var loaded = _files.Read(path);
        _suspend = true;
        if (left)
        {
            LeftPath = path;
            LeftText = loaded.Text;
            _leftLoaded = loaded;
            _leftDirty = false;
        }
        else
        {
            RightPath = path;
            RightText = loaded.Text;
            _rightLoaded = loaded;
            _rightDirty = false;
        }

        _suspend = false;
        Dirty = _leftDirty || _rightDirty;
        Status = Path.GetFileName(path) + " loaded as " + loaded.EncodingName + (loaded.Bom ? " with BOM" : "") + ".";
    }

    private async Task SaveSide(bool left)
    {
        var path = left ? LeftPath : RightPath;
        var loaded = left ? _leftLoaded : _rightLoaded;
        var text = left ? LeftText : RightText;
        if (string.IsNullOrWhiteSpace(path))
        {
            path = await Dialogs.Current.PickSaveFileAsync(left ? "Save left file" : "Save right file", "txt") ?? "";
            if (string.IsNullOrWhiteSpace(path))
                return;
        }

        loaded ??= new LoadedText(text, "utf-8", TextLines.DetectNewLine(text), false, text.EndsWith('\n') || text.EndsWith('\r'));
        _files.WriteAtomic(path, text, loaded, backup: true);
        ReadInto(path, left);
        Status = "Saved " + path + ". A .bak copy was kept beside it.";
    }

    private TextCompareOptions Options() => new()
    {
        IgnoreCase = IgnoreCase,
        IgnoreWhitespace = IgnoreWhitespace,
        IgnoreBlankLines = IgnoreBlankLines
    };

    private static string Preview(IReadOnlyList<string> lines) =>
        lines.Count == 0 ? "" : lines[0].Length > 80 ? lines[0][..80] : lines[0];
}
