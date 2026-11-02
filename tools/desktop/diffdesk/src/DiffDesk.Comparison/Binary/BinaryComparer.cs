using System.Security.Cryptography;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Binary;

public sealed class BinaryComparer : IBinaryComparisonService
{
    private const int Cap = 5000;

    public BinaryDiffResult Compare(string leftPath, string rightPath, CancellationToken cancellationToken)
    {
        using var left = Open(leftPath);
        using var right = Open(rightPath);
        using var leftHash = SHA256.Create();
        using var rightHash = SHA256.Create();
        var regions = new List<BinaryRegion>();
        var truncated = false;
        long different = 0;
        long offset = 0;
        long? runStart = null;
        var runLength = 0;
        var leftBuffer = new byte[256 * 1024];
        var rightBuffer = new byte[256 * 1024];
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var leftRead = left.Read(leftBuffer);
            var rightRead = right.Read(rightBuffer);
            if (leftRead == 0 && rightRead == 0)
                break;
            if (leftRead > 0)
                leftHash.TransformBlock(leftBuffer, 0, leftRead, null, 0);
            if (rightRead > 0)
                rightHash.TransformBlock(rightBuffer, 0, rightRead, null, 0);
            var count = Math.Max(leftRead, rightRead);
            for (var i = 0; i < count; i++)
            {
                var changed = i >= leftRead || i >= rightRead || leftBuffer[i] != rightBuffer[i];
                if (changed)
                {
                    different++;
                    if (runStart is null)
                    {
                        runStart = offset + i;
                        runLength = 1;
                    }
                    else
                    {
                        runLength++;
                    }
                }
                else if (runStart is not null)
                {
                    Flush();
                }
            }

            offset += count;
        }

        if (runStart is not null)
            Flush();
        leftHash.TransformFinalBlock([], 0, 0);
        rightHash.TransformFinalBlock([], 0, 0);
        return new BinaryDiffResult
        {
            Equal = different == 0 && left.Length == right.Length,
            LeftLength = left.Length,
            RightLength = right.Length,
            LeftSha256 = Convert.ToHexString(leftHash.Hash!).ToLowerInvariant(),
            RightSha256 = Convert.ToHexString(rightHash.Hash!).ToLowerInvariant(),
            DifferentBytes = different,
            Regions = regions,
            RegionsTruncated = truncated
        };

        void Flush()
        {
            if (regions.Count < Cap)
                regions.Add(new BinaryRegion(runStart!.Value, runLength));
            else
                truncated = true;
            runStart = null;
            runLength = 0;
        }
    }

    public HexWindow ReadWindow(string leftPath, string rightPath, long offset, int length)
    {
        length = Math.Clamp(length, 1, 4096);
        if (offset < 0)
            offset = 0;
        var left = ReadAt(leftPath, offset, length);
        var right = ReadAt(rightPath, offset, length);
        return new HexWindow(offset, left, right, Math.Max(left.Length, right.Length));
    }

    private static byte[] ReadAt(string path, long offset, int length)
    {
        using var stream = Open(path);
        if (offset >= stream.Length)
            return [];
        stream.Seek(offset, SeekOrigin.Begin);
        var count = (int)Math.Min(length, stream.Length - offset);
        var buffer = new byte[count];
        var read = 0;
        while (read < count)
        {
            var n = stream.Read(buffer, read, count - read);
            if (n == 0)
                break;
            read += n;
        }

        return read == count ? buffer : buffer[..read];
    }

    private static FileStream Open(string path) =>
        new(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 128 * 1024, FileOptions.SequentialScan);
}
