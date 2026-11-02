namespace DiffDesk.Comparison.Folder;

public static class PathFilter
{
    public static bool IsMatch(string relativePath, string pattern)
    {
        var path = Normalize(relativePath);
        var pat = Normalize(pattern);
        if (pat.Length == 0)
            return false;
        if (!pat.Contains('/'))
            path = path.Contains('/') ? path[(path.LastIndexOf('/') + 1)..] : path;
        return Match(path.Split('/'), pat.Split('/'));
    }

    public static string Normalize(string path) =>
        path.Replace('\\', '/').Trim('/');

    private static bool Match(string[] text, string[] pattern) => Match(text, 0, pattern, 0);

    private static bool Match(string[] text, int textIndex, string[] pattern, int patternIndex)
    {
        while (patternIndex < pattern.Length)
        {
            if (pattern[patternIndex] == "**")
            {
                if (patternIndex == pattern.Length - 1)
                    return true;
                for (var skip = textIndex; skip <= text.Length; skip++)
                {
                    if (Match(text, skip, pattern, patternIndex + 1))
                        return true;
                }

                return false;
            }

            if (textIndex >= text.Length)
                return false;
            if (!MatchSegment(text[textIndex], pattern[patternIndex]))
                return false;
            textIndex++;
            patternIndex++;
        }

        return textIndex == text.Length;
    }

    private static bool MatchSegment(string text, string pattern)
    {
        var textIndex = 0;
        var patternIndex = 0;
        var star = -1;
        var mark = -1;
        while (textIndex < text.Length)
        {
            if (patternIndex < pattern.Length && (pattern[patternIndex] == '?' || pattern[patternIndex] == text[textIndex]))
            {
                textIndex++;
                patternIndex++;
            }
            else if (patternIndex < pattern.Length && pattern[patternIndex] == '*')
            {
                star = patternIndex++;
                mark = textIndex;
            }
            else if (star >= 0)
            {
                patternIndex = star + 1;
                textIndex = ++mark;
            }
            else
            {
                return false;
            }
        }

        while (patternIndex < pattern.Length && pattern[patternIndex] == '*')
            patternIndex++;
        return patternIndex == pattern.Length;
    }
}
