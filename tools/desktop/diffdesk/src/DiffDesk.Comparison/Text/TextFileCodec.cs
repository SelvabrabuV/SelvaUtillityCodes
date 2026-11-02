using System.Text;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Text;

public sealed class TextFileCodec : ITextFileStore
{
    static TextFileCodec()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }

    public LoadedText Read(string path)
    {
        var full = PathSafety.RequireFullPath(path);
        var bytes = File.ReadAllBytes(full);
        return Decode(bytes);
    }

    public static LoadedText Decode(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            var text = Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
            return Finish("utf-8", text, bom: true);
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            var text = Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
            return Finish("utf-16", text, bom: true);
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
        {
            var text = Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);
            return Finish("utf-16BE", text, bom: true);
        }

        if (TryUtf8(bytes, out var utf8))
            return Finish("utf-8", utf8, bom: false);

        var ansi = Encoding.GetEncoding(1252).GetString(bytes);
        return Finish("windows-1252", ansi, bom: false);
    }

    public void WriteAtomic(string path, string text, LoadedText original, bool backup)
    {
        var full = PathSafety.RequireFullPath(path);
        var directory = Path.GetDirectoryName(full) ?? throw new InvalidOperationException("The file has no folder.");
        Directory.CreateDirectory(directory);
        var stored = TextLines.ApplyNewLine(text, original.NewLine);
        var bytes = Encode(stored, original);
        var temp = full + ".diffdesk.tmp";
        try
        {
            File.WriteAllBytes(temp, bytes);
            if (backup && File.Exists(full))
                File.Copy(full, full + ".bak", overwrite: true);
            if (File.Exists(full))
                File.Replace(temp, full, destinationBackupFileName: null, ignoreMetadataErrors: true);
            else
                File.Move(temp, full);
        }
        catch
        {
            if (File.Exists(temp))
                File.Delete(temp);
            throw;
        }
    }

    public static byte[] Encode(string text, LoadedText original)
    {
        Encoding encoding = original.EncodingName switch
        {
            "utf-8" => new UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
            "utf-16" => new UnicodeEncoding(bigEndian: false, byteOrderMark: false),
            "utf-16BE" => new UnicodeEncoding(bigEndian: true, byteOrderMark: false),
            "windows-1252" => Encoding.GetEncoding(1252),
            _ => Encoding.GetEncoding(original.EncodingName)
        };
        encoding = Encoding.GetEncoding(encoding.CodePage, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
        var body = encoding.GetBytes(text);
        if (!original.Bom)
            return body;

        var preamble = original.EncodingName switch
        {
            "utf-8" => new byte[] { 0xEF, 0xBB, 0xBF },
            "utf-16" => new byte[] { 0xFF, 0xFE },
            "utf-16BE" => new byte[] { 0xFE, 0xFF },
            _ => encoding.GetPreamble()
        };
        var all = new byte[preamble.Length + body.Length];
        preamble.CopyTo(all, 0);
        body.CopyTo(all, preamble.Length);
        return all;
    }

    private static LoadedText Finish(string encodingName, string text, bool bom)
    {
        var split = TextLines.Split(text);
        return new LoadedText(text, encodingName, split.NewLine, bom, split.EndsWithNewLine);
    }

    private static bool TryUtf8(byte[] bytes, out string text)
    {
        try
        {
            var strict = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
            text = strict.GetString(bytes);
            return true;
        }
        catch (DecoderFallbackException)
        {
            text = "";
            return false;
        }
    }
}
