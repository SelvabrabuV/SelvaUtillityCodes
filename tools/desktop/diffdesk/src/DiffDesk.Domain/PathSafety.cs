namespace DiffDesk.Domain;

public static class PathSafety
{
    public static string RequireFullPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("A path is required.");
        if (path.Contains('\0'))
            throw new ArgumentException("The path contains a null character.");
        return Path.GetFullPath(path);
    }

    public static bool SameOrNested(string first, string second)
    {
        var a = Normalize(first);
        var b = Normalize(second);
        return a.Equals(b, StringComparison.OrdinalIgnoreCase) || IsInside(a, b) || IsInside(b, a);
    }

    public static string? OverlapMessage(string first, string second)
    {
        try
        {
            if (SameOrNested(first, second))
                return "Those folders overlap. Pick two folders that do not contain each other.";
            return null;
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return ex.Message;
        }
    }

    public static bool IsInside(string parent, string child)
    {
        var prefix = Normalize(parent) + Path.DirectorySeparatorChar;
        var fullChild = Normalize(child) + Path.DirectorySeparatorChar;
        return fullChild.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
    }

    public static string CombineUnderRoot(string root, string relative)
    {
        if (string.IsNullOrWhiteSpace(relative) || relative.Contains('\0'))
            throw new InvalidOperationException("The relative path is empty or invalid.");
        var normalized = relative.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        if (Path.IsPathRooted(normalized) || normalized.Split(Path.DirectorySeparatorChar).Contains(".."))
            throw new InvalidOperationException("The path escapes the selected folder.");

        var fullRoot = RequireFullPath(root);
        var combined = Path.GetFullPath(Path.Combine(fullRoot, normalized));
        if (!combined.Equals(Normalize(fullRoot), StringComparison.OrdinalIgnoreCase) && !IsInside(fullRoot, combined))
            throw new InvalidOperationException("The path escapes the selected folder.");
        return combined;
    }

    public static string Normalize(string path)
    {
        var full = Path.GetFullPath(path);
        return full.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }
}
