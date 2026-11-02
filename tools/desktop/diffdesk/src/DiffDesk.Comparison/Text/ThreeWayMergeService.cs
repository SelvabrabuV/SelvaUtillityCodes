using DiffPlex;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Text;

public sealed class ThreeWayMergeService : IThreeWayMergeService
{
    private readonly Differ _differ = new();

    public MergeResult Merge(string baseText, string leftText, string rightText, TextCompareOptions options)
    {
        options ??= TextCompareOptions.Default;
        var baseSplit = TextLines.Split(baseText);
        var leftEdits = Edits(baseText, leftText, options);
        var rightEdits = Edits(baseText, rightText, options);
        var pieces = new List<MergePiece>();
        var cursor = 0;
        var leftIndex = 0;
        var rightIndex = 0;
        var nextId = 1;

        while (leftIndex < leftEdits.Count || rightIndex < rightEdits.Count)
        {
            var hasLeft = leftIndex < leftEdits.Count;
            var hasRight = rightIndex < rightEdits.Count;
            if (hasLeft && hasRight && Overlaps(leftEdits[leftIndex], rightEdits[rightIndex]))
            {
                var start = Math.Min(leftEdits[leftIndex].Start, rightEdits[rightIndex].Start);
                var end = Math.Max(End(leftEdits[leftIndex]), End(rightEdits[rightIndex]));
                var takenLeft = new List<Edit>();
                var takenRight = new List<Edit>();
                while (true)
                {
                    var grew = false;
                    while (leftIndex < leftEdits.Count && leftEdits[leftIndex].Start <= end)
                    {
                        end = Math.Max(end, End(leftEdits[leftIndex]));
                        takenLeft.Add(leftEdits[leftIndex]);
                        leftIndex++;
                        grew = true;
                    }

                    while (rightIndex < rightEdits.Count && rightEdits[rightIndex].Start <= end)
                    {
                        end = Math.Max(end, End(rightEdits[rightIndex]));
                        takenRight.Add(rightEdits[rightIndex]);
                        rightIndex++;
                        grew = true;
                    }

                    if (!grew)
                        break;
                }

                AddUnchanged(pieces, baseSplit.Lines, ref cursor, start, ref nextId);
                var leftLines = Apply(baseSplit.Lines, takenLeft, start, end);
                var rightLines = Apply(baseSplit.Lines, takenRight, start, end);
                var baseLines = baseSplit.Lines.Skip(start).Take(end - start).ToArray();
                if (SequenceEqual(leftLines, rightLines))
                {
                    pieces.Add(new MergePiece
                    {
                        Id = nextId++,
                        Kind = MergePieceKind.Both,
                        Lines = leftLines,
                        LeftLines = leftLines,
                        RightLines = rightLines,
                        BaseLines = baseLines,
                        Resolved = true
                    });
                }
                else
                {
                    pieces.Add(new MergePiece
                    {
                        Id = nextId++,
                        Kind = MergePieceKind.Conflict,
                        Lines = [],
                        LeftLines = leftLines,
                        RightLines = rightLines,
                        BaseLines = baseLines
                    });
                }

                cursor = end;
            }
            else if (hasLeft && (!hasRight || leftEdits[leftIndex].Start <= rightEdits[rightIndex].Start))
            {
                var edit = leftEdits[leftIndex++];
                AddUnchanged(pieces, baseSplit.Lines, ref cursor, edit.Start, ref nextId);
                pieces.Add(new MergePiece
                {
                    Id = nextId++,
                    Kind = MergePieceKind.LeftOnly,
                    Lines = edit.Lines,
                    LeftLines = edit.Lines,
                    BaseLines = baseSplit.Lines.Skip(edit.Start).Take(edit.Count).ToArray(),
                    Resolved = true
                });
                cursor = edit.Start + edit.Count;
            }
            else
            {
                var edit = rightEdits[rightIndex++];
                AddUnchanged(pieces, baseSplit.Lines, ref cursor, edit.Start, ref nextId);
                pieces.Add(new MergePiece
                {
                    Id = nextId++,
                    Kind = MergePieceKind.RightOnly,
                    Lines = edit.Lines,
                    RightLines = edit.Lines,
                    BaseLines = baseSplit.Lines.Skip(edit.Start).Take(edit.Count).ToArray(),
                    Resolved = true
                });
                cursor = edit.Start + edit.Count;
            }
        }

        AddUnchanged(pieces, baseSplit.Lines, ref cursor, baseSplit.Lines.Count, ref nextId);
        var merged = new MergeResult
        {
            Pieces = pieces,
            ConflictCount = pieces.Count(static piece => piece.Kind == MergePieceKind.Conflict && !piece.Resolved),
            BaseEndedWithNewLine = baseSplit.EndsWithNewLine
        };
        return merged with { RenderedText = Render(merged, includeConflictMarkers: true) };
    }

    public MergeResult Resolve(MergeResult current, int pieceId, MergeResolution resolution)
    {
        var pieces = current.Pieces.Select(piece =>
        {
            if (piece.Id != pieceId || piece.Kind != MergePieceKind.Conflict)
                return piece;
            IReadOnlyList<string> chosen = resolution switch
            {
                MergeResolution.Left => piece.LeftLines,
                MergeResolution.Right => piece.RightLines,
                _ => piece.LeftLines.Concat(piece.RightLines).ToArray()
            };
            return new MergePiece
            {
                Id = piece.Id,
                Kind = MergePieceKind.Both,
                Lines = chosen,
                LeftLines = piece.LeftLines,
                RightLines = piece.RightLines,
                BaseLines = piece.BaseLines,
                Resolved = true
            };
        }).ToList();

        var updated = current with
        {
            Pieces = pieces,
            ConflictCount = pieces.Count(static piece => piece.Kind == MergePieceKind.Conflict && !piece.Resolved)
        };
        return updated with { RenderedText = Render(updated, includeConflictMarkers: true) };
    }

    public string Render(MergeResult result, bool includeConflictMarkers)
    {
        var lines = new List<string>();
        foreach (var piece in result.Pieces)
        {
            if (piece.Kind == MergePieceKind.Conflict && !piece.Resolved)
            {
                if (!includeConflictMarkers)
                    continue;
                lines.Add("<<<<<<< LEFT");
                lines.AddRange(piece.LeftLines);
                lines.Add("=======");
                lines.AddRange(piece.RightLines);
                lines.Add(">>>>>>> RIGHT");
            }
            else
            {
                lines.AddRange(piece.Lines);
            }
        }

        return TextLines.Join(lines, "\n", result.BaseEndedWithNewLine);
    }

    private List<Edit> Edits(string baseText, string otherText, TextCompareOptions options)
    {
        var baseLines = TextLines.Split(baseText).Lines;
        var otherLines = TextLines.Split(otherText).Lines;
        if (baseLines.Count == 0 && otherLines.Count == 0)
            return [];
        if (baseLines.Count == 0)
            return [new Edit(0, 0, otherLines.ToArray())];
        if (otherLines.Count == 0)
            return [new Edit(0, baseLines.Count, [])];

        var diff = _differ.CreateLineDiffs(
            string.Join('\n', baseLines.Select(line => TextLines.Key(line, options))),
            string.Join('\n', otherLines.Select(line => TextLines.Key(line, options))),
            false,
            false);
        var edits = new List<Edit>();
        foreach (var block in diff.DiffBlocks)
        {
            var lines = otherLines.Skip(block.InsertStartB).Take(block.InsertCountB).ToArray();
            edits.Add(new Edit(block.DeleteStartA, block.DeleteCountA, lines));
        }

        return edits;
    }

    private static void AddUnchanged(List<MergePiece> pieces, List<string> baseLines, ref int cursor, int until, ref int nextId)
    {
        if (until <= cursor)
            return;
        pieces.Add(new MergePiece
        {
            Id = nextId++,
            Kind = MergePieceKind.Unchanged,
            Lines = baseLines.Skip(cursor).Take(until - cursor).ToArray(),
            BaseLines = baseLines.Skip(cursor).Take(until - cursor).ToArray(),
            Resolved = true
        });
        cursor = until;
    }

    private static string[] Apply(IReadOnlyList<string> baseLines, List<Edit> edits, int start, int end)
    {
        var result = new List<string>();
        var cursor = start;
        foreach (var edit in edits.OrderBy(static edit => edit.Start))
        {
            if (edit.Start > cursor)
                result.AddRange(baseLines.Skip(cursor).Take(edit.Start - cursor));
            result.AddRange(edit.Lines);
            cursor = Math.Max(cursor, edit.Start + edit.Count);
        }

        if (cursor < end)
            result.AddRange(baseLines.Skip(cursor).Take(end - cursor));
        return result.ToArray();
    }

    private static bool Overlaps(Edit left, Edit right)
    {
        if (left.Count == 0 && right.Count == 0)
            return left.Start == right.Start;
        if (left.Count == 0)
            return left.Start >= right.Start && left.Start < right.Start + right.Count;
        if (right.Count == 0)
            return right.Start >= left.Start && right.Start < left.Start + left.Count;
        return left.Start < right.Start + right.Count && right.Start < left.Start + left.Count;
    }

    private static int End(Edit edit) => edit.Start + edit.Count;

    private static bool SequenceEqual(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        if (left.Count != right.Count)
            return false;
        for (var i = 0; i < left.Count; i++)
        {
            if (left[i] != right[i])
                return false;
        }

        return true;
    }

    private readonly record struct Edit(int Start, int Count, string[] Lines);
}
