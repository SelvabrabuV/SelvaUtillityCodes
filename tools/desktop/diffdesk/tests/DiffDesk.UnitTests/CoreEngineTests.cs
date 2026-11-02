using DiffDesk.Comparison.Folder;
using DiffDesk.Comparison.Text;
using DiffDesk.Domain;

namespace DiffDesk.UnitTests;

public class CoreEngineTests
{
    private readonly TextDiffService _diff = new();
    private readonly ThreeWayMergeService _merge = new();
    private readonly TextFileCodec _codec = new();

    [Fact]
    public void PathSafety_RejectsEmptyNullAndParentEscape()
    {
        Assert.Throws<ArgumentException>(() => PathSafety.RequireFullPath("  "));
        Assert.Throws<ArgumentException>(() => PathSafety.RequireFullPath("a\0b"));
        using var dir = new TempDir();
        Assert.Throws<InvalidOperationException>(() => PathSafety.CombineUnderRoot(dir.Path, "..\\outside.txt"));
        Assert.Throws<InvalidOperationException>(() => PathSafety.CombineUnderRoot(dir.Path, "C:\\outside.txt"));
    }

    [Fact]
    public void PathFilter_MatchesNamesAndGlobs()
    {
        Assert.True(PathFilter.IsMatch("src/notes.log", "*.log"));
        Assert.True(PathFilter.IsMatch("src/bin/app.dll", "**/bin/**"));
        Assert.False(PathFilter.IsMatch("src/notes.txt", "*.log"));
        Assert.True(PathFilter.IsMatch("src/a.cs", "src/?.cs"));
    }

    [Fact]
    public void TextDiff_ReportsAModifiedLineAndAppliesTheHunk()
    {
        var diff = _diff.Compare("alpha\nbeta\ngamma\n", "alpha\nBETA\ngamma\n", TextCompareOptions.Default);
        Assert.False(diff.Identical);
        var hunk = Assert.Single(diff.Hunks);
        Assert.Equal("beta", Assert.Single(hunk.LeftLines));
        Assert.Equal("BETA", Assert.Single(hunk.RightLines));
        var applied = _diff.ApplyHunk("alpha\nbeta\ngamma\n", hunk.LeftStart, hunk.LeftCount, hunk.RightLines, "\n", true);
        Assert.Equal("alpha\nBETA\ngamma\n", applied);
        Assert.Contains("BETA", _diff.ToUnified("left", "right", diff));
    }

    [Fact]
    public void TextDiff_IgnoreRulesTreatWhitespaceAndBlankLinesAsTheSame()
    {
        var whitespace = _diff.Compare("a b\n", "ab\n", new TextCompareOptions { IgnoreWhitespace = true });
        Assert.True(whitespace.Identical);
        var blanks = _diff.Compare("a\n\nb\n", "a\nb\n", new TextCompareOptions { IgnoreBlankLines = true });
        Assert.True(blanks.Identical);
        var casing = _diff.Compare("Hello\n", "hello\n", new TextCompareOptions { IgnoreCase = true });
        Assert.True(casing.Identical);
    }

    [Fact]
    public void TextCodec_PreservesBomNewLineAndWindows1252()
    {
        var bom = TextFileCodec.Decode(new byte[] { 0xEF, 0xBB, 0xBF, (byte)'A', (byte)'\r', (byte)'\n' });
        Assert.Equal("utf-8", bom.EncodingName);
        Assert.True(bom.Bom);
        Assert.Equal("\r\n", bom.NewLine);
        var ansi = TextFileCodec.Decode(new byte[] { 0x80 });
        Assert.Equal("windows-1252", ansi.EncodingName);
        Assert.Equal("€", ansi.Text);

        using var dir = new TempDir();
        var path = Path.Combine(dir.Path, "note.txt");
        File.WriteAllBytes(path, new byte[] { 0xEF, 0xBB, 0xBF, (byte)'A', (byte)'\r', (byte)'\n' });
        var loaded = _codec.Read(path);
        _codec.WriteAtomic(path, "B\r\n", loaded, backup: true);
        var bytes = File.ReadAllBytes(path);
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF, (byte)'B', (byte)'\r', (byte)'\n' }, bytes);
        Assert.True(File.Exists(path + ".bak"));
    }

    [Fact]
    public void Merge_AutoAppliesDisjointEditsAndKeepsConflicts()
    {
        var merged = _merge.Merge("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n", TextCompareOptions.Default);
        Assert.Equal(0, merged.ConflictCount);
        Assert.Contains("A", merged.RenderedText);
        Assert.Contains("C", merged.RenderedText);
        Assert.DoesNotContain("<<<<<<<", merged.RenderedText);

        var same = _merge.Merge("a\n", "X\n", "X\n", TextCompareOptions.Default);
        Assert.Equal(0, same.ConflictCount);
        Assert.True(same.Pieces.Any(piece => piece.Kind == MergePieceKind.Both));

        var conflict = _merge.Merge("a\n", "L\n", "R\n", TextCompareOptions.Default);
        Assert.Equal(1, conflict.ConflictCount);
        Assert.Contains("<<<<<<< LEFT", conflict.RenderedText);
        Assert.Contains("=======", conflict.RenderedText);
        Assert.Contains(">>>>>>> RIGHT", conflict.RenderedText);
        var piece = Assert.Single(conflict.Pieces, item => item.Kind == MergePieceKind.Conflict);
        var resolved = _merge.Resolve(conflict, piece.Id, MergeResolution.Left);
        Assert.Equal(0, resolved.ConflictCount);
        Assert.DoesNotContain("<<<<<<<", resolved.RenderedText);
        Assert.Contains("L", resolved.RenderedText);
    }

    [Fact]
    public void Lines_KeepTheTrailingNewlineFlag()
    {
        var one = TextLines.Split("a\n");
        Assert.Equal(new[] { "a" }, one.Lines);
        Assert.True(one.EndsWithNewLine);
        Assert.Equal("a\n\n", TextLines.Join(new[] { "a", "" }, "\n", true));
        Assert.Equal("", TextLines.Join(Array.Empty<string>(), "\n", true));
    }
}
