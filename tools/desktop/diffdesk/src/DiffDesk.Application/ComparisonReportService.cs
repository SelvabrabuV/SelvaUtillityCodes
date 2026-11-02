using System.Net;
using System.Text;
using System.Text.Json;
using DiffDesk.Domain;

namespace DiffDesk.Application;

public sealed class ComparisonReportService : IComparisonReportService
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public string BuildFolderReport(FolderComparisonResult result, ReportFormat format)
    {
        return format switch
        {
            ReportFormat.Json => JsonSerializer.Serialize(result, Json),
            ReportFormat.Csv => FolderCsv(result),
            ReportFormat.Html => FolderHtml(result),
            _ => FolderText(result)
        };
    }

    public string BuildTextReport(string leftLabel, string rightLabel, TextDiffResult diff, ReportFormat format)
    {
        var rows = diff.Hunks.Select(hunk => new
        {
            hunk.Id,
            hunk.LeftStart,
            hunk.LeftCount,
            hunk.RightStart,
            hunk.RightCount,
            Left = string.Join("\n", hunk.LeftLines),
            Right = string.Join("\n", hunk.RightLines)
        });
        return format switch
        {
            ReportFormat.Json => JsonSerializer.Serialize(new { leftLabel, rightLabel, diff.Added, diff.Removed, diff.Modified, identical = diff.Identical, hunks = rows }, Json),
            ReportFormat.Csv => "Id,LeftStart,LeftCount,RightStart,RightCount\n" + string.Join('\n', diff.Hunks.Select(hunk => $"{hunk.Id},{hunk.LeftStart + 1},{hunk.LeftCount},{hunk.RightStart + 1},{hunk.RightCount}")),
            ReportFormat.Html => $"<html><body><h1>{WebUtility.HtmlEncode(leftLabel)} and {WebUtility.HtmlEncode(rightLabel)}</h1><p>{diff.Added} added, {diff.Removed} removed, {diff.Modified} modified.</p></body></html>",
            _ => $"{leftLabel} -> {rightLabel}\n{diff.Added} added, {diff.Removed} removed, {diff.Modified} modified.\n" + string.Join('\n', diff.Hunks.Select(hunk => $"@@ -{hunk.LeftStart + 1},{hunk.LeftCount} +{hunk.RightStart + 1},{hunk.RightCount}"))
        };
    }

    public void Write(string path, string content)
    {
        var full = PathSafety.RequireFullPath(path);
        var directory = Path.GetDirectoryName(full);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);
        var temp = full + ".diffdesk.tmp";
        File.WriteAllText(temp, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        if (File.Exists(full))
            File.Replace(temp, full, destinationBackupFileName: null, ignoreMetadataErrors: true);
        else
            File.Move(temp, full);
    }

    private static string FolderText(FolderComparisonResult result)
    {
        var builder = new StringBuilder();
        builder.Append("Left: ").AppendLine(result.LeftRoot);
        builder.Append("Right: ").AppendLine(result.RightRoot);
        builder.AppendLine(result.Summary);
        foreach (var entry in result.Entries.Where(static entry => entry.Status != CompareStatus.Identical))
            builder.Append(entry.Status).Append('\t').Append(entry.RelativePath).Append('\t').AppendLine(entry.Detail);
        return builder.ToString();
    }

    private static string FolderCsv(FolderComparisonResult result)
    {
        var builder = new StringBuilder();
        builder.AppendLine("RelativePath,Kind,Status,LeftLength,RightLength,Detail");
        foreach (var entry in result.Entries)
        {
            builder.Append(Escape(entry.RelativePath)).Append(',')
                .Append(entry.Kind).Append(',')
                .Append(entry.Status).Append(',')
                .Append(entry.LeftLength).Append(',')
                .Append(entry.RightLength).Append(',')
                .Append(Escape(entry.Detail)).AppendLine();
        }

        return builder.ToString();
    }

    private static string FolderHtml(FolderComparisonResult result)
    {
        var builder = new StringBuilder();
        builder.Append("<html><head><meta charset=\"utf-8\"><title>DiffDesk report</title></head><body>");
        builder.Append("<h1>Folder comparison</h1><p>").Append(WebUtility.HtmlEncode(result.Summary)).Append("</p><table border=\"1\"><tr><th>Path</th><th>Status</th><th>Detail</th></tr>");
        foreach (var entry in result.Entries)
        {
            builder.Append("<tr><td>").Append(WebUtility.HtmlEncode(entry.RelativePath))
                .Append("</td><td>").Append(entry.Status)
                .Append("</td><td>").Append(WebUtility.HtmlEncode(entry.Detail))
                .Append("</td></tr>");
        }

        builder.Append("</table></body></html>");
        return builder.ToString();
    }

    private static string Escape(string? value)
    {
        var text = value ?? "";
        return text.Contains('"') || text.Contains(',') ? "\"" + text.Replace("\"", "\"\"") + "\"" : text;
    }
}
