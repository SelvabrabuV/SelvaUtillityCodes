namespace DiffDesk.Infrastructure;

public static class AppLocations
{
    public static string Root()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DiffDesk");
        Directory.CreateDirectory(path);
        return path;
    }

    public static string Logs() => Directory.CreateDirectory(Path.Combine(Root(), "logs")).FullName;

    public static string Recovery() => Directory.CreateDirectory(Path.Combine(Root(), "recovery")).FullName;

    public static string ShellLeftPath() => Path.Combine(Root(), "shell-left.txt");
}
