using Avalonia;
using Avalonia.Data;
using AvaloniaEdit;

namespace DiffDesk.Desktop.Controls;

public class BindableEditor : TextEditor
{
    private bool _updating;

    public static readonly StyledProperty<string?> BoundTextProperty =
        AvaloniaProperty.Register<BindableEditor, string?>(nameof(BoundText), defaultBindingMode: BindingMode.TwoWay);

    public string? BoundText
    {
        get => GetValue(BoundTextProperty);
        set => SetValue(BoundTextProperty, value);
    }

    public BindableEditor()
    {
        ShowLineNumbers = true;
        FontFamily = "Cascadia Mono,Consolas,monospace";
        Document.TextChanged += OnDocumentTextChanged;
        BoundTextProperty.Changed.AddClassHandler<BindableEditor>((editor, change) => editor.ApplyBound(change.NewValue as string));
    }

    public bool FindNext(string term)
    {
        if (string.IsNullOrEmpty(term) || Document.TextLength == 0)
            return false;
        var start = Math.Clamp(SelectionStart + Math.Max(SelectionLength, 1), 0, Document.TextLength);
        var index = Document.Text.IndexOf(term, start, StringComparison.OrdinalIgnoreCase);
        if (index < 0 && start > 0)
            index = Document.Text.IndexOf(term, 0, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
            return false;
        Select(index, term.Length);
        ScrollToLine(Document.GetLineByOffset(index).LineNumber);
        return true;
    }

    public int ReplaceAll(string find, string replace)
    {
        if (string.IsNullOrEmpty(find))
            return 0;
        var count = 0;
        var text = Document.Text;
        var next = new System.Text.StringBuilder();
        var index = 0;
        while (index < text.Length)
        {
            var found = text.IndexOf(find, index, StringComparison.OrdinalIgnoreCase);
            if (found < 0)
            {
                next.Append(text, index, text.Length - index);
                break;
            }

            next.Append(text, index, found - index);
            next.Append(replace);
            index = found + find.Length;
            count++;
        }

        if (count > 0)
            BoundText = next.ToString();
        return count;
    }

    private void ApplyBound(string? value)
    {
        var next = value ?? "";
        if (Document.Text == next)
            return;
        _updating = true;
        Document.Text = next;
        _updating = false;
    }

    private void OnDocumentTextChanged(object? sender, EventArgs e)
    {
        if (_updating)
            return;
        var text = Document.Text;
        if (BoundText != text)
            BoundText = text;
    }
}
