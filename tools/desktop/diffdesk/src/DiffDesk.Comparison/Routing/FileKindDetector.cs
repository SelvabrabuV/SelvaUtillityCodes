namespace DiffDesk.Comparison.Routing;

public static class FileKindDetector
{
    public static string KindFor(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension switch
        {
            ".png" or ".jpg" or ".jpeg" or ".bmp" or ".gif" or ".webp" => "image",
            ".csv" or ".tsv" => "table",
            ".xlsx" => "table",
            ".json" => "json",
            ".xml" => "xml",
            ".pdf" or ".docx" => "document",
            _ => LooksBinary(path) ? "binary" : "text"
        };
    }

    public static bool LooksBinary(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            var buffer = new byte[8192];
            var read = stream.Read(buffer);
            for (var i = 0; i < read; i++)
            {
                if (buffer[i] == 0)
                    return true;
            }

            return false;
        }
        catch (IOException)
        {
            return false;
        }
    }
}
