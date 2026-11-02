using DiffPlex;
using DiffPlex.Model;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Text;

public sealed class TextDiffService : ITextDiffService
{
    private readonly Differ _differ = new();

    public TextDiffResult Compare(string left, string right, TextCompareOptions options)
    {
        options ??= TextCompareOptions.Default;
        var leftSplit = TextLines.Split(left);
        var rightSplit = TextLines.Split(right);
        var leftLines = leftSplit.Lines;
        var rightLines = rightSplit.Lines;
        var leftMap = Significant(leftLines, options);
        var rightMap = Significant(rightLines, options);
        var leftMarks = Enumerable.Repeat(LineChange.Same, leftLines.Count).ToArray();
        var rightMarks = Enumerable.Repeat(LineChange.Same, rightLines.Count).ToArray();
        var leftSpans = new List<InlineSpan>[leftLines.Count];
        var rightSpans = new List<InlineSpan>[rightLines.Count];
        var hunks = new List<TextHunk>();

        if (leftMap.Count == 0 && rightMap.Count == 0)
            return Build(leftMarks, rightMarks, leftSpans, rightSpans, hunks);

        if (leftMap.Count == 0 || rightMap.Count == 0)
        {
            AddHunk(hunks, leftLines, rightLines, leftMap, rightMap, 0, leftMap.Count, 0, rightMap.Count, leftMarks, rightMarks, leftSpans, rightSpans);
            return Build(leftMarks, rightMarks, leftSpans, rightSpans, hunks);
        }

        var diff = _differ.CreateLineDiffs(JoinKeys(leftLines, leftMap, options), JoinKeys(rightLines, rightMap, options), ignoreWhitespace: false, ignoreCase: false);
        var cursorLeft = 0;
        var cursorRight = 0;
        foreach (var block in diff.DiffBlocks)
        {
            MarkSame(leftLines, rightLines, leftMap, rightMap, cursorLeft, block.DeleteStartA, cursorRight, block.InsertStartB, leftSpans, rightSpans, options);
            AddHunk(hunks, leftLines, rightLines, leftMap, rightMap, block.DeleteStartA, block.DeleteCountA, block.InsertStartB, block.InsertCountB, leftMarks, rightMarks, leftSpans, rightSpans);
            cursorLeft = block.DeleteStartA + block.DeleteCountA;
            cursorRight = block.InsertStartB + block.InsertCountB;
        }

        MarkSame(leftLines, rightLines, leftMap, rightMap, cursorLeft, leftMap.Count, cursorRight, rightMap.Count, leftSpans, rightSpans, options);
        return Build(leftMarks, rightMarks, leftSpans, rightSpans, hunks);
    }

    public string ApplyHunk(string document, int start, int count, IReadOnlyList<string> replacement, string newLine, bool endsWithNewLine)
    {
        var split = TextLines.Split(document);
        if (start < 0 || count < 0 || start > split.Lines.Count || start + count > split.Lines.Count)
            throw new ArgumentOutOfRangeException(nameof(start), "That change is outside the file.");
        split.Lines.RemoveRange(start, count);
        split.Lines.InsertRange(start, replacement);
        return TextLines.Join(split.Lines, string.IsNullOrEmpty(newLine) ? split.NewLine : newLine, endsWithNewLine || split.EndsWithNewLine);
    }

    public string ToUnified(string leftLabel, string rightLabel, TextDiffResult diff)
    {
        var builder = new System.Text.StringBuilder();
        builder.Append("--- ").AppendLine(leftLabel);
        builder.Append("+++ ").AppendLine(rightLabel);
        foreach (var hunk in diff.Hunks)
        {
            builder.Append("@@ -").Append(hunk.LeftStart + 1).Append(',').Append(hunk.LeftCount)
                .Append(" +").Append(hunk.RightStart + 1).Append(',').Append(hunk.RightCount).AppendLine(" @@");
            foreach (var line in hunk.LeftLines)
                builder.Append('-').AppendLine(line);
            foreach (var line in hunk.RightLines)
                builder.Append('+').AppendLine(line);
        }

        return builder.ToString();
    }

    private void MarkSame(
        List<string> leftLines,
        List<string> rightLines,
        List<int> leftMap,
        List<int> rightMap,
        int leftFrom,
        int leftTo,
        int rightFrom,
        int rightTo,
        List<InlineSpan>[] leftSpans,
        List<InlineSpan>[] rightSpans,
        TextCompareOptions options)
    {
        var count = Math.Min(leftTo - leftFrom, rightTo - rightFrom);
        for (var i = 0; i < count; i++)
        {
            var leftIndex = leftMap[leftFrom + i];
            var rightIndex = rightMap[rightFrom + i];
            if (leftLines[leftIndex] != rightLines[rightIndex])
            {
                var spans = CharacterSpans(leftLines[leftIndex], rightLines[rightIndex]);
                leftSpans[leftIndex] = spans.Left;
                rightSpans[rightIndex] = spans.Right;
            }
        }
    }

    private void AddHunk(
        List<TextHunk> hunks,
        List<string> leftLines,
        List<string> rightLines,
        List<int> leftMap,
        List<int> rightMap,
        int leftStart,
        int leftCount,
        int rightStart,
        int rightCount,
        LineChange[] leftMarks,
        LineChange[] rightMarks,
        List<InlineSpan>[] leftSpans,
        List<InlineSpan>[] rightSpans)
    {
        var pairs = Math.Min(leftCount, rightCount);
        for (var i = 0; i < pairs; i++)
        {
            var li = leftMap[leftStart + i];
            var ri = rightMap[rightStart + i];
            leftMarks[li] = LineChange.Modified;
            rightMarks[ri] = LineChange.Modified;
            var spans = CharacterSpans(leftLines[li], rightLines[ri]);
            leftSpans[li] = spans.Left;
            rightSpans[ri] = spans.Right;
        }

        for (var i = pairs; i < leftCount; i++)
            leftMarks[leftMap[leftStart + i]] = LineChange.Removed;
        for (var i = pairs; i < rightCount; i++)
            rightMarks[rightMap[rightStart + i]] = LineChange.Added;

        var (originLeft, takenLeft) = Slice(leftLines, leftMap, leftStart, leftCount);
        var (originRight, takenRight) = Slice(rightLines, rightMap, rightStart, rightCount);
        hunks.Add(new TextHunk
        {
            Id = hunks.Count + 1,
            LeftStart = originLeft,
            LeftCount = takenLeft.Count,
            RightStart = originRight,
            RightCount = takenRight.Count,
            LeftLines = takenLeft,
            RightLines = takenRight
        });
    }

    private static (int Start, List<string> Lines) Slice(List<string> lines, List<int> map, int start, int count)
    {
        if (count == 0)
        {
            var at = start >= map.Count ? lines.Count : map[start];
            return (at, []);
        }

        var first = map[start];
        var last = map[start + count - 1];
        var taken = lines.GetRange(first, last - first + 1);
        return (first, taken);
    }

    private (List<InlineSpan> Left, List<InlineSpan> Right) CharacterSpans(string left, string right)
    {
        if (left.Length > 2000 || right.Length > 2000)
        {
            return (
                [new InlineSpan(0, left.Length, true)],
                [new InlineSpan(0, right.Length, true)]);
        }

        var diff = _differ.CreateCharacterDiffs(left, right, false, false);
        return (Spans(diff, leftSide: true), Spans(diff, leftSide: false));
    }

    private static List<InlineSpan> Spans(DiffResult diff, bool leftSide)
    {
        var spans = new List<InlineSpan>();
        foreach (var block in diff.DiffBlocks)
        {
            if (leftSide && block.DeleteCountA > 0)
                spans.Add(new InlineSpan(block.DeleteStartA, block.DeleteCountA, true));
            if (!leftSide && block.InsertCountB > 0)
                spans.Add(new InlineSpan(block.InsertStartB, block.InsertCountB, true));
        }

        return spans;
    }

    private static List<int> Significant(List<string> lines, TextCompareOptions options)
    {
        var map = new List<int>(lines.Count);
        for (var i = 0; i < lines.Count; i++)
        {
            if (options.IgnoreBlankLines && string.IsNullOrWhiteSpace(lines[i]))
                continue;
            map.Add(i);
        }

        return map;
    }

    private static string JoinKeys(List<string> lines, List<int> map, TextCompareOptions options)
    {
        return string.Join('\n', map.Select(index => TextLines.Key(lines[index], options)));
    }

    private static TextDiffResult Build(
        LineChange[] leftMarks,
        LineChange[] rightMarks,
        List<InlineSpan>[] leftSpans,
        List<InlineSpan>[] rightSpans,
        List<TextHunk> hunks)
    {
        return new TextDiffResult
        {
            LeftMarks = ToMarks(leftMarks, leftSpans),
            RightMarks = ToMarks(rightMarks, rightSpans),
            Hunks = hunks,
            Added = rightMarks.Count(static mark => mark == LineChange.Added),
            Removed = leftMarks.Count(static mark => mark == LineChange.Removed),
            Modified = leftMarks.Count(static mark => mark == LineChange.Modified)
        };
    }

    private static List<TextLineMark> ToMarks(LineChange[] marks, List<InlineSpan>[] spans)
    {
        var list = new List<TextLineMark>(marks.Length);
        for (var i = 0; i < marks.Length; i++)
        {
            list.Add(new TextLineMark
            {
                LineNumber = i + 1,
                Change = marks[i],
                Spans = spans[i] ?? []
            });
        }

        return list;
    }
}
