using System.Runtime.InteropServices;
using Avalonia;
using DiffDesk.Infrastructure;
using Microsoft.Win32.SafeHandles;

namespace DiffDesk.Desktop;

internal static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (Has(args, "--version") || (args.Length > 0 && args[0] == "version"))
        {
            WriteToConsole("DiffDesk 1.0.0");
            return 0;
        }

        Launch.Read(args);
        BuildAvaloniaApp().StartWithClassicDesktopLifetime([]);
        return 0;
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();

    private static bool Has(string[] args, string name) =>
        args.Any(arg => arg.Equals(name, StringComparison.OrdinalIgnoreCase));

    private static void WriteToConsole(string text)
    {
        // A WinExe starts without a console. Write to the real stdout handle so a redirect captures it.
        var handle = GetStdHandle(-11);
        if (IsInvalid(handle))
        {
            if (!AttachConsole(-1))
                AllocConsole();
            handle = GetStdHandle(-11);
        }

        if (!IsInvalid(handle))
        {
            try
            {
                using var stream = new FileStream(new SafeFileHandle(handle, ownsHandle: false), FileAccess.Write);
                using var writer = new StreamWriter(stream) { AutoFlush = true };
                writer.WriteLine(text);
                return;
            }
            catch (IOException)
            {
            }
        }

        using var fallback = new FileStream("CONOUT$", FileMode.Open, FileAccess.Write, FileShare.ReadWrite);
        using var fallbackWriter = new StreamWriter(fallback) { AutoFlush = true };
        fallbackWriter.WriteLine(text);
    }

    private static bool IsInvalid(IntPtr handle) => handle == IntPtr.Zero || handle == new IntPtr(-1);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int standardHandle);

    [DllImport("kernel32.dll")]
    private static extern bool AttachConsole(int processId);

    [DllImport("kernel32.dll")]
    private static extern bool AllocConsole();
}

internal static class Launch
{
    public static string? Left { get; private set; }
    public static string? Right { get; private set; }
    public static bool Files { get; private set; }

    public static void Read(string[] args)
    {
        var select = Value(args, "--select-left");
        if (!string.IsNullOrWhiteSpace(select))
        {
            Directory.CreateDirectory(AppLocations.Root());
            File.WriteAllText(AppLocations.ShellLeftPath(), select);
        }

        var folder = Values(args, "--folders");
        var file = Values(args, "--files");
        Files = file.Count > 0;
        var pair = file.Count > 0 ? file : folder;
        Left = pair.Count > 0 ? pair[0] : null;
        Right = pair.Count > 1 ? pair[1] : null;
        var stored = ReadStored();
        if (!string.IsNullOrWhiteSpace(stored) && string.IsNullOrWhiteSpace(Left))
            Left = stored;
        else if (!string.IsNullOrWhiteSpace(stored) && string.IsNullOrWhiteSpace(Right) && !string.IsNullOrWhiteSpace(Left) && !string.Equals(Left, stored, StringComparison.OrdinalIgnoreCase))
        {
            Right = Left;
            Left = stored;
            ClearStored();
        }
        else if (pair.Count > 1)
        {
            ClearStored();
        }
    }

    private static string? ReadStored()
    {
        var path = AppLocations.ShellLeftPath();
        return File.Exists(path) ? File.ReadAllText(path).Trim() : null;
    }

    private static void ClearStored()
    {
        var path = AppLocations.ShellLeftPath();
        if (File.Exists(path))
            File.Delete(path);
    }

    private static string? Value(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }

        return null;
    }

    private static List<string> Values(string[] args, string name)
    {
        var values = new List<string>();
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (!args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                continue;
            if (args[i + 1].StartsWith("--", StringComparison.Ordinal))
                continue;
            values.Add(args[i + 1]);
            if (i + 2 < args.Length && !args[i + 2].StartsWith("--", StringComparison.Ordinal))
                values.Add(args[i + 2]);
            break;
        }

        return values;
    }
}
