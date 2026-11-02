namespace DiffDesk.UnitTests;

internal sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "diffdesk-tests", Guid.NewGuid().ToString("N"));

    public TempDir() => Directory.CreateDirectory(Path);

    public string Sub(string name)
    {
        var path = System.IO.Path.Combine(Path, name);
        Directory.CreateDirectory(path);
        return path;
    }

    public void Dispose()
    {
        try
        {
            if (!Directory.Exists(Path))
                return;
            foreach (var entry in Directory.EnumerateFileSystemEntries(Path, "*", SearchOption.AllDirectories).OrderByDescending(static item => item.Length))
            {
                var attributes = File.GetAttributes(entry);
                if ((attributes & FileAttributes.ReparsePoint) == 0)
                    continue;
                if ((attributes & FileAttributes.Directory) != 0)
                    Directory.Delete(entry);
                else
                    File.Delete(entry);
            }

            Directory.Delete(Path, true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
        }
    }
}
