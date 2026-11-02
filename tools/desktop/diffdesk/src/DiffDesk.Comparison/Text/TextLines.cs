using DiffDesk.Domain;

namespace DiffDesk.Comparison.Text;

public sealed record LineSplit(List<string> Lines, string NewLine, bool EndsWithNewLine);

public static class TextLines
{
    public static LineSplit Split(string? text)
    {
        text ??= "";
        var lines = new List<string>();
        var newline = DetectNewLine(text);
        var start = 0;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] == '\r')
            {
                lines.Add(text[start..i]);
                if (i + 1 < text.Length && text[i + 1] == '\n')
                    i++;
                start = i + 1;
            }
            else if (text[i] == '\n')
            {
                lines.Add(text[start..i]);
                start = i + 1;
            }
        }

        var ends = text.Length > 0 && (text[^1] == '\n' || text[^1] == '\r');
        if (start < text.Length)
            lines.Add(text[start..]);
        return new LineSplit(lines, newline, ends);
    }

    public static string Join(IReadOnlyList<string> lines, string newLine, bool endsWithNewLine)
    {
        if (lines.Count == 0)
            return "";
        var body = string.Join(newLine, lines);
        return endsWithNewLine ? body + newLine : body;
    }

    public static string DetectNewLine(string text)
    {
        var crlf = 0;
        var lf = 0;
        var cr = 0;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] == '\r')
            {
                if (i + 1 < text.Length && text[i + 1] == '\n')
                {
                    crlf++;
                    i++;
                }
                else
                {
                    cr++;
                }
            }
            else if (text[i] == '\n')
            {
                lf++;
            }
        }

        if (crlf >= lf && crlf >= cr && crlf > 0)
            return "\r\n";
        if (cr > lf && cr > 0)
            return "\r";
        return "\n";
    }

    public static string Key(string line, TextCompareOptions options)
    {
        var value = line;
        if (options.IgnoreWhitespace)
            value = string.Concat(value.Where(static c => !char.IsWhiteSpace(c)));
        else if (options.IgnoreLeadingTrailingWhitespace)
            value = value.Trim();
        if (options.IgnoreCase)
            value = value.ToUpperInvariant();
        return value;
    }

    public static string ApplyNewLine(string text, string newLine)
    {
        var normalized = text.Replace("\r\n", "\n").Replace('\r', '\n');
        return newLine == "\n" ? normalized : normalized.Replace("\n", newLine);
    }
}
