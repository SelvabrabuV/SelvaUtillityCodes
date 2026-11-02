using System.Xml;
using System.Xml.Linq;
using System.Text.Json;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Structured;

public sealed class StructuredDiffService : IStructuredDiffService
{
    public IReadOnlyList<StructuredDiff> CompareJson(string left, string right, bool ignoreObjectOrder, ArrayCompareMode arrays, string? arrayKey)
    {
        JsonDocument leftDoc;
        JsonDocument rightDoc;
        try
        {
            leftDoc = JsonDocument.Parse(left);
        }
        catch (JsonException ex)
        {
            return [new StructuredDiff { Path = "$", Kind = "ParseError", LeftValue = ex.Message }];
        }

        try
        {
            rightDoc = JsonDocument.Parse(right);
        }
        catch (JsonException ex)
        {
            leftDoc.Dispose();
            return [new StructuredDiff { Path = "$", Kind = "ParseError", RightValue = ex.Message }];
        }

        using (leftDoc)
        using (rightDoc)
        {
            var diffs = new List<StructuredDiff>();
            Walk(leftDoc.RootElement, rightDoc.RootElement, "$", diffs, ignoreObjectOrder, arrays, arrayKey);
            return diffs;
        }
    }

    public IReadOnlyList<StructuredDiff> CompareXml(string left, string right, bool ignoreAttributeOrder, bool ignoreInsignificantWhitespace)
    {
        XDocument leftDoc;
        XDocument rightDoc;
        try
        {
            leftDoc = Load(left);
        }
        catch (Exception ex) when (ex is XmlException or InvalidOperationException)
        {
            return [new StructuredDiff { Path = "/", Kind = "ParseError", LeftValue = ex.Message }];
        }

        try
        {
            rightDoc = Load(right);
        }
        catch (Exception ex) when (ex is XmlException or InvalidOperationException)
        {
            return [new StructuredDiff { Path = "/", Kind = "ParseError", RightValue = ex.Message }];
        }

        if (leftDoc.Root is null || rightDoc.Root is null)
            return [new StructuredDiff { Path = "/", Kind = "ParseError", LeftValue = "The document has no root element." }];

        var diffs = new List<StructuredDiff>();
        CompareElements(leftDoc.Root, rightDoc.Root, "/" + leftDoc.Root.Name.LocalName, diffs, ignoreAttributeOrder, ignoreInsignificantWhitespace);
        return diffs;
    }

    private static void Walk(JsonElement left, JsonElement right, string path, List<StructuredDiff> diffs, bool ignoreObjectOrder, ArrayCompareMode arrays, string? arrayKey)
    {
        if (left.ValueKind != right.ValueKind)
        {
            diffs.Add(new StructuredDiff { Path = path, Kind = "Type", LeftValue = left.ValueKind.ToString(), RightValue = right.ValueKind.ToString() });
            return;
        }

        switch (left.ValueKind)
        {
            case JsonValueKind.Object:
                var leftProps = LastWins(left);
                var rightProps = LastWins(right);
                foreach (var name in leftProps.Keys.Union(rightProps.Keys).OrderBy(static name => name, StringComparer.Ordinal))
                {
                    var child = path + "." + name;
                    if (!leftProps.ContainsKey(name))
                        diffs.Add(new StructuredDiff { Path = child, Kind = "MissingLeft", RightValue = rightProps[name].ToString() });
                    else if (!rightProps.ContainsKey(name))
                        diffs.Add(new StructuredDiff { Path = child, Kind = "MissingRight", LeftValue = leftProps[name].ToString() });
                    else
                        Walk(leftProps[name], rightProps[name], child, diffs, ignoreObjectOrder, arrays, arrayKey);
                }

                _ = ignoreObjectOrder;
                break;
            case JsonValueKind.Array:
                var leftItems = left.EnumerateArray().ToList();
                var rightItems = right.EnumerateArray().ToList();
                if (arrays == ArrayCompareMode.Key && !string.IsNullOrWhiteSpace(arrayKey) && CanKey(leftItems, arrayKey) && CanKey(rightItems, arrayKey))
                    CompareKeyed(leftItems, rightItems, path, arrayKey, diffs, ignoreObjectOrder, arrays);
                else
                {
                    var count = Math.Max(leftItems.Count, rightItems.Count);
                    for (var i = 0; i < count; i++)
                    {
                        var child = path + "[" + i + "]";
                        if (i >= leftItems.Count)
                            diffs.Add(new StructuredDiff { Path = child, Kind = "MissingLeft", RightValue = rightItems[i].ToString() });
                        else if (i >= rightItems.Count)
                            diffs.Add(new StructuredDiff { Path = child, Kind = "MissingRight", LeftValue = leftItems[i].ToString() });
                        else
                            Walk(leftItems[i], rightItems[i], child, diffs, ignoreObjectOrder, arrays, arrayKey);
                    }
                }

                break;
            default:
                if (left.ToString() != right.ToString())
                    diffs.Add(new StructuredDiff { Path = path, Kind = "Value", LeftValue = left.ToString(), RightValue = right.ToString() });
                break;
        }
    }

    private static Dictionary<string, JsonElement> LastWins(JsonElement element)
    {
        var map = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
            map[property.Name] = property.Value;
        return map;
    }

    private static void CompareKeyed(List<JsonElement> leftItems, List<JsonElement> rightItems, string path, string arrayKey, List<StructuredDiff> diffs, bool ignoreObjectOrder, ArrayCompareMode arrays)
    {
        var leftGroups = leftItems.GroupBy(item => item.GetProperty(arrayKey).ToString()).ToList();
        var rightGroups = rightItems.GroupBy(item => item.GetProperty(arrayKey).ToString()).ToList();
        foreach (var group in leftGroups.Where(static group => group.Count() > 1))
            diffs.Add(new StructuredDiff { Path = path, Kind = "DuplicateKey", LeftValue = group.Key, RightValue = "The left array has duplicate keys, so those items were not paired." });
        foreach (var group in rightGroups.Where(static group => group.Count() > 1))
            diffs.Add(new StructuredDiff { Path = path, Kind = "DuplicateKey", RightValue = group.Key, LeftValue = "The right array has duplicate keys, so those items were not paired." });

        var leftMap = leftGroups.Where(static group => group.Count() == 1).ToDictionary(static group => group.Key, static group => group.First());
        var rightMap = rightGroups.Where(static group => group.Count() == 1).ToDictionary(static group => group.Key, static group => group.First());
        foreach (var key in leftMap.Keys.Union(rightMap.Keys))
        {
            var child = path + "[" + arrayKey + "=" + key + "]";
            if (!leftMap.ContainsKey(key))
                diffs.Add(new StructuredDiff { Path = child, Kind = "MissingLeft", RightValue = key });
            else if (!rightMap.ContainsKey(key))
                diffs.Add(new StructuredDiff { Path = child, Kind = "MissingRight", LeftValue = key });
            else
                Walk(leftMap[key], rightMap[key], child, diffs, ignoreObjectOrder, arrays, arrayKey);
        }
    }

    private static bool CanKey(List<JsonElement> items, string arrayKey) =>
        items.All(item => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(arrayKey, out _));

    private static XDocument Load(string xml)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            IgnoreComments = true,
            IgnoreProcessingInstructions = true
        };
        using var reader = XmlReader.Create(new StringReader(xml), settings);
        return XDocument.Load(reader, LoadOptions.None);
    }

    private static void CompareElements(XElement left, XElement right, string path, List<StructuredDiff> diffs, bool ignoreAttributeOrder, bool ignoreWhitespace)
    {
        if (left.Name != right.Name)
        {
            diffs.Add(new StructuredDiff { Path = path, Kind = "Element", LeftValue = left.Name.ToString(), RightValue = right.Name.ToString() });
            return;
        }

        var leftAttrs = Attributes(left, ignoreAttributeOrder);
        var rightAttrs = Attributes(right, ignoreAttributeOrder);
        foreach (var name in leftAttrs.Keys.Union(rightAttrs.Keys))
        {
            var child = path + "/@" + name;
            if (!leftAttrs.ContainsKey(name))
                diffs.Add(new StructuredDiff { Path = child, Kind = "MissingLeft", RightValue = rightAttrs[name] });
            else if (!rightAttrs.ContainsKey(name))
                diffs.Add(new StructuredDiff { Path = child, Kind = "MissingRight", LeftValue = leftAttrs[name] });
            else if (leftAttrs[name] != rightAttrs[name])
                diffs.Add(new StructuredDiff { Path = child, Kind = "Attribute", LeftValue = leftAttrs[name], RightValue = rightAttrs[name] });
        }

        var leftChildren = Children(left, ignoreWhitespace);
        var rightChildren = Children(right, ignoreWhitespace);
        var count = Math.Max(leftChildren.Count, rightChildren.Count);
        for (var i = 0; i < count; i++)
        {
            var childPath = path + "/*[" + (i + 1) + "]";
            if (i >= leftChildren.Count)
                diffs.Add(new StructuredDiff { Path = childPath, Kind = "MissingLeft", RightValue = Describe(rightChildren[i]) });
            else if (i >= rightChildren.Count)
                diffs.Add(new StructuredDiff { Path = childPath, Kind = "MissingRight", LeftValue = Describe(leftChildren[i]) });
            else if (leftChildren[i] is XElement leftElement && rightChildren[i] is XElement rightElement)
                CompareElements(leftElement, rightElement, path + "/" + rightElement.Name.LocalName + "[" + (i + 1) + "]", diffs, ignoreAttributeOrder, ignoreWhitespace);
            else if (Describe(leftChildren[i]) != Describe(rightChildren[i]))
                diffs.Add(new StructuredDiff { Path = childPath, Kind = "Text", LeftValue = Describe(leftChildren[i]), RightValue = Describe(rightChildren[i]) });
        }
    }

    private static Dictionary<string, string> Attributes(XElement element, bool ignoreOrder)
    {
        var query = element.Attributes().Where(static attribute => !attribute.IsNamespaceDeclaration);
        if (ignoreOrder)
            query = query.OrderBy(static attribute => attribute.Name.ToString(), StringComparer.Ordinal);
        return query.ToDictionary(static attribute => attribute.Name.ToString(), static attribute => attribute.Value);
    }

    private static List<XNode> Children(XElement element, bool ignoreWhitespace)
    {
        var nodes = element.Nodes().Where(node => node is XElement || node is XText).ToList();
        if (!ignoreWhitespace)
            return nodes;
        return nodes.Where(node => node is not XText text || !string.IsNullOrWhiteSpace(text.Value)).ToList();
    }

    private static string Describe(XNode node) => node switch
    {
        XElement element => element.Name.ToString(),
        XText text => text.Value.Trim(),
        _ => node.ToString()
    };
}
