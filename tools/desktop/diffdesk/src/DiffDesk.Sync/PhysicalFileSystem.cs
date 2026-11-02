using DiffDesk.Domain;

namespace DiffDesk.Sync;

public sealed class PhysicalFileSystem : IFileSystemService
{
    public string RequireFullPath(string path) => PathSafety.RequireFullPath(path);

    public string CombineUnderRoot(string root, string relativePath) => PathSafety.CombineUnderRoot(root, relativePath);

    public bool SameOrNested(string first, string second) => PathSafety.SameOrNested(first, second);

    public bool IsReparsePoint(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path))
            return false;
        return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
    }

    public void CopyAtomic(string source, string destination)
    {
        var directory = Path.GetDirectoryName(destination) ?? throw new InvalidOperationException("The destination has no folder.");
        Directory.CreateDirectory(directory);
        var temp = destination + ".diffdesk.tmp";
        File.Copy(source, temp, overwrite: true);
        File.SetLastWriteTimeUtc(temp, File.GetLastWriteTimeUtc(source));
        if (File.Exists(destination))
            File.Replace(temp, destination, destinationBackupFileName: null, ignoreMetadataErrors: true);
        else
            File.Move(temp, destination);
    }

    public void DeleteFile(string path) => File.Delete(path);

    public void CreateDirectory(string path) => Directory.CreateDirectory(path);

    public bool DeleteDirectoryIfEmpty(string path)
    {
        if (Directory.EnumerateFileSystemEntries(path).Any())
            return false;
        Directory.Delete(path, recursive: false);
        return true;
    }
}

public sealed class BackupService : IBackupService
{
    public string Backup(string sourceFile, string backupRoot, string relativePath)
    {
        var target = Path.Combine(backupRoot, relativePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar));
        var directory = Path.GetDirectoryName(target);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);
        if (File.Exists(sourceFile))
            File.Copy(sourceFile, target, overwrite: true);
        else
            throw new FileNotFoundException("There is no file to back up.", sourceFile);
        return target;
    }
}
