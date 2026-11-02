using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using CsvHelper;
using CsvHelper.Configuration;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Table;

public sealed class TableComparer : ITableComparisonService
{
    public TableComparison CompareCsv(string leftPath, string rightPath, TableCompareOptions options)
    {
        try
        {
            var left = ReadCsv(leftPath, options);
            var right = ReadCsv(rightPath, options);
            return CompareSheets(left, right, options, null, []);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or CsvHelperException or ReaderException)
        {
            return new TableComparison { Warning = ex.Message };
        }
    }

    public TableComparison CompareXlsx(string leftPath, string rightPath, TableCompareOptions options)
    {
        try
        {
            using var leftBook = new XLWorkbook(leftPath);
            using var rightBook = new XLWorkbook(rightPath);
            var names = leftBook.Worksheets.Select(static sheet => sheet.Name).ToList();
            var sheetName = options.SheetName;
            if (string.IsNullOrWhiteSpace(sheetName))
                sheetName = names.FirstOrDefault();
            if (sheetName is null || leftBook.Worksheets.All(sheet => sheet.Name != sheetName) || rightBook.Worksheets.All(sheet => sheet.Name != sheetName))
                return new TableComparison { SheetNames = names, Warning = "Pick a sheet that exists in both workbooks. Formulas are not executed." };

            var warning = "Values are compared. Formulas and macros are not executed.";
            return CompareSheets(ReadSheet(leftBook.Worksheet(sheetName), options), ReadSheet(rightBook.Worksheet(sheetName), options), options, sheetName, names) with { Warning = warning };
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return new TableComparison { Warning = ex.Message };
        }
    }

    public string ExportCsv(TableComparison comparison)
    {
        var builder = new StringBuilder();
        builder.AppendLine("Kind,Sheet,Key,Column,LeftRow,RightRow,LeftValue,RightValue,Detail");
        foreach (var diff in comparison.Diffs)
        {
            builder.Append(Csv(diff.Kind)).Append(',')
                .Append(Csv(diff.Sheet)).Append(',')
                .Append(Csv(diff.Key)).Append(',')
                .Append(Csv(diff.Column)).Append(',')
                .Append(diff.LeftRow).Append(',')
                .Append(diff.RightRow).Append(',')
                .Append(Csv(diff.LeftValue)).Append(',')
                .Append(Csv(diff.RightValue)).Append(',')
                .Append(Csv(diff.Detail)).AppendLine();
        }

        return builder.ToString();
    }

    private static TableComparison CompareSheets(Sheet left, Sheet right, TableCompareOptions options, string? sheet, IReadOnlyList<string> sheetNames)
    {
        var diffs = new List<TableDiff>();
        foreach (var column in left.Columns.Except(right.Columns))
            diffs.Add(new TableDiff { Sheet = sheet, Kind = "ColumnRemoved", Column = column, Detail = "The column is only on the left." });
        foreach (var column in right.Columns.Except(left.Columns))
            diffs.Add(new TableDiff { Sheet = sheet, Kind = "ColumnAdded", Column = column, Detail = "The column is only on the right." });

        var ignore = new HashSet<string>(options.IgnoreColumns, StringComparer.OrdinalIgnoreCase);
        var columns = left.Columns.Intersect(right.Columns).Where(column => !ignore.Contains(column)).ToList();
        if (options.KeyColumns.Count > 0)
            CompareByKey(left, right, options, columns, sheet, diffs);
        else if (options.IgnoreRowOrder)
            CompareUnordered(left, right, options, columns, sheet, diffs);
        else
            ComparePositional(left, right, options, columns, sheet, diffs);

        return new TableComparison
        {
            LeftColumns = left.Columns,
            RightColumns = right.Columns,
            SheetNames = sheetNames,
            Diffs = diffs,
            Warning = "Blank and missing values stay distinct from the number zero. Macros are never run."
        };
    }

    private static void CompareByKey(Sheet left, Sheet right, TableCompareOptions options, List<string> columns, string? sheet, List<TableDiff> diffs)
    {
        var leftGroups = left.Rows.GroupBy(row => Key(row, options)).ToList();
        var rightGroups = right.Rows.GroupBy(row => Key(row, options)).ToList();
        foreach (var group in leftGroups.Where(static group => group.Count() > 1))
            diffs.Add(new TableDiff { Sheet = sheet, Kind = "DuplicateKey", Key = group.Key, Detail = "The left side has this key more than once, so the rows were not paired." });
        foreach (var group in rightGroups.Where(static group => group.Count() > 1))
            diffs.Add(new TableDiff { Sheet = sheet, Kind = "DuplicateKey", Key = group.Key, Detail = "The right side has this key more than once, so the rows were not paired." });

        var leftMap = leftGroups.Where(static group => group.Count() == 1).ToDictionary(static group => group.Key, static group => group.First());
        var rightMap = rightGroups.Where(static group => group.Count() == 1).ToDictionary(static group => group.Key, static group => group.First());
        foreach (var key in leftMap.Keys.Union(rightMap.Keys))
        {
            if (!leftMap.ContainsKey(key))
                diffs.Add(new TableDiff { Sheet = sheet, Kind = "RowAdded", Key = key, RightRow = rightMap[key].Number });
            else if (!rightMap.ContainsKey(key))
                diffs.Add(new TableDiff { Sheet = sheet, Kind = "RowRemoved", Key = key, LeftRow = leftMap[key].Number });
            else
                CompareCells(leftMap[key], rightMap[key], options, columns, sheet, key, diffs);
        }
    }

    private static void CompareUnordered(Sheet left, Sheet right, TableCompareOptions options, List<string> columns, string? sheet, List<TableDiff> diffs)
    {
        var pool = right.Rows.ToList();
        foreach (var row in left.Rows)
        {
            var match = pool.FindIndex(candidate => columns.All(column => Norm(row.Values.GetValueOrDefault(column), options) == Norm(candidate.Values.GetValueOrDefault(column), options)));
            if (match < 0)
                diffs.Add(new TableDiff { Sheet = sheet, Kind = "RowRemoved", LeftRow = row.Number });
            else
                pool.RemoveAt(match);
        }

        foreach (var row in pool)
            diffs.Add(new TableDiff { Sheet = sheet, Kind = "RowAdded", RightRow = row.Number });
    }

    private static void ComparePositional(Sheet left, Sheet right, TableCompareOptions options, List<string> columns, string? sheet, List<TableDiff> diffs)
    {
        var count = Math.Max(left.Rows.Count, right.Rows.Count);
        for (var i = 0; i < count; i++)
        {
            if (i >= left.Rows.Count)
                diffs.Add(new TableDiff { Sheet = sheet, Kind = "RowAdded", RightRow = right.Rows[i].Number });
            else if (i >= right.Rows.Count)
                diffs.Add(new TableDiff { Sheet = sheet, Kind = "RowRemoved", LeftRow = left.Rows[i].Number });
            else
                CompareCells(left.Rows[i], right.Rows[i], options, columns, sheet, null, diffs);
        }
    }

    private static void CompareCells(Row left, Row right, TableCompareOptions options, List<string> columns, string? sheet, string? key, List<TableDiff> diffs)
    {
        foreach (var column in columns)
        {
            var leftValue = left.Values.GetValueOrDefault(column) ?? "";
            var rightValue = right.Values.GetValueOrDefault(column) ?? "";
            if (Norm(leftValue, options) == Norm(rightValue, options))
                continue;
            diffs.Add(new TableDiff
            {
                Sheet = sheet,
                Kind = "Cell",
                Key = key,
                Column = column,
                LeftRow = left.Number,
                RightRow = right.Number,
                LeftValue = leftValue,
                RightValue = rightValue
            });
        }
    }

    private static string Key(Row row, TableCompareOptions options) =>
        string.Join("|", options.KeyColumns.Select(column => Norm(row.Values.GetValueOrDefault(column), options)));

    private static string Norm(string? value, TableCompareOptions options)
    {
        var text = value ?? "";
        if (options.TrimValues)
            text = text.Trim();
        return options.IgnoreCase ? text.ToUpperInvariant() : text;
    }

    private static Sheet ReadCsv(string path, TableCompareOptions options)
    {
        using var reader = new StreamReader(path);
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            Delimiter = options.Delimiter == '\t' ? "\t" : options.Delimiter.ToString(),
            BadDataFound = null,
            MissingFieldFound = null,
            HeaderValidated = null
        };
        using var csv = new CsvReader(reader, config);
        if (options.HasHeader)
        {
            if (!csv.Read() || !csv.ReadHeader())
                return new Sheet([], []);
            var columns = csv.HeaderRecord?.ToList() ?? [];
            var rows = new List<Row>();
            var number = 2;
            while (csv.Read())
            {
                var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var column in columns)
                    values[column] = csv.GetField(column) ?? "";
                rows.Add(new Row(number++, values));
            }

            return new Sheet(columns, rows);
        }

        var raw = new List<string[]>();
        while (csv.Read())
        {
            var width = csv.Parser.Count;
            var fields = new string[width];
            for (var i = 0; i < width; i++)
                fields[i] = csv.GetField(i) ?? "";
            raw.Add(fields);
        }

        var count = raw.Count == 0 ? 0 : raw.Max(static line => line.Length);
        var generated = Enumerable.Range(1, count).Select(static i => "Column" + i).ToList();
        var body = raw.Select((line, index) =>
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < generated.Count; i++)
                values[generated[i]] = i < line.Length ? line[i] : "";
            return new Row(index + 1, values);
        }).ToList();
        return new Sheet(generated, body);
    }

    private static Sheet ReadSheet(IXLWorksheet sheet, TableCompareOptions options)
    {
        var used = sheet.RangeUsed();
        if (used is null)
            return new Sheet([], []);
        var firstRow = Math.Max(1, options.HeaderRow);
        var lastRow = used.LastRow().RowNumber();
        var lastColumn = used.LastColumn().ColumnNumber();
        var columns = new List<string>();
        if (options.HasHeader)
        {
            for (var column = 1; column <= lastColumn; column++)
            {
                var name = CellText(sheet.Cell(firstRow, column));
                columns.Add(string.IsNullOrWhiteSpace(name) ? "Column" + column : name);
            }
        }
        else
        {
            columns.AddRange(Enumerable.Range(1, lastColumn).Select(static column => "Column" + column));
            firstRow--;
        }

        var rows = new List<Row>();
        for (var rowNumber = firstRow + 1; rowNumber <= lastRow; rowNumber++)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var column = 1; column <= columns.Count; column++)
                values[columns[column - 1]] = CellText(sheet.Cell(rowNumber, column));
            rows.Add(new Row(rowNumber, values));
        }

        return new Sheet(columns, rows);
    }

    private static string CellText(IXLCell cell)
    {
        var text = cell.GetString();
        if (cell.HasFormula && string.IsNullOrEmpty(text))
            return "=" + cell.FormulaA1;
        return text;
    }

    private static string Csv(string? value)
    {
        var text = value ?? "";
        if (text.Contains('"') || text.Contains(',') || text.Contains('\n'))
            return "\"" + text.Replace("\"", "\"\"") + "\"";
        return text;
    }

    private sealed record Sheet(IReadOnlyList<string> Columns, IReadOnlyList<Row> Rows);
    private sealed record Row(int Number, Dictionary<string, string> Values);
}
