using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using DiffDesk.Domain;

namespace DiffDesk.Comparison.Image;

public sealed class ImageComparer : IImageComparisonService
{
    public const long MaxPixels = 40_000_000;

    public ImageDiffResult Compare(string leftPath, string rightPath, int channelTolerance, string? heatmapPath, CancellationToken cancellationToken)
    {
        channelTolerance = Math.Clamp(channelTolerance, 0, 255);
        var binaryEqual = Hash(leftPath, cancellationToken) == Hash(rightPath, cancellationToken);
        Bitmap left;
        Bitmap right;
        try
        {
            left = new Bitmap(leftPath);
            right = new Bitmap(rightPath);
        }
        catch (Exception ex) when (ex is ArgumentException or IOException or ExternalException or OutOfMemoryException)
        {
            return new ImageDiffResult
            {
                FilesBinaryEqual = binaryEqual,
                Detail = "Windows could not decode this image. WebP depends on the installed codecs. " + ex.Message
            };
        }

        using (left)
        using (right)
        {
            var notes = new List<string>();
            if (leftPath.EndsWith(".gif", StringComparison.OrdinalIgnoreCase) || rightPath.EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
                notes.Add("GIF comparison uses the first frame.");
            if (left.Width != right.Width || left.Height != right.Height)
            {
                notes.Add("The images have different dimensions, so pixels were not resized or compared.");
                return new ImageDiffResult
                {
                    SameDimensions = false,
                    FilesBinaryEqual = binaryEqual,
                    LeftWidth = left.Width,
                    LeftHeight = left.Height,
                    RightWidth = right.Width,
                    RightHeight = right.Height,
                    Detail = string.Join(" ", notes)
                };
            }

            var pixels = (long)left.Width * left.Height;
            if (pixels > MaxPixels)
            {
                notes.Add("The image is over 40 megapixels, so the pixel comparison was skipped.");
                return Sized(left, right, binaryEqual, pixels, notes);
            }

            long different = 0;
            Bitmap? heat = heatmapPath is null ? null : new Bitmap(left.Width, left.Height, PixelFormat.Format32bppArgb);
            try
            {
                different = Count(left, right, heat, channelTolerance, cancellationToken);
            }
            finally
            {
                if (heat is not null && heatmapPath is not null)
                {
                    var folder = Path.GetDirectoryName(Path.GetFullPath(heatmapPath));
                    if (!string.IsNullOrEmpty(folder))
                        Directory.CreateDirectory(folder);
                    heat.Save(heatmapPath, ImageFormat.Png);
                    heat.Dispose();
                }
            }

            notes.Add(binaryEqual
                ? "The file bytes match."
                : "Decoded pixels are compared separately from file-byte equality.");
            return new ImageDiffResult
            {
                PixelCompared = true,
                SameDimensions = true,
                PixelsEqual = different == 0,
                FilesBinaryEqual = binaryEqual,
                LeftWidth = left.Width,
                LeftHeight = left.Height,
                RightWidth = right.Width,
                RightHeight = right.Height,
                DifferentPixels = different,
                TotalPixels = pixels,
                DifferencePercent = pixels == 0 ? 0 : different * 100d / pixels,
                HeatmapPngPath = heatmapPath,
                Detail = string.Join(" ", notes)
            };
        }
    }

    private static ImageDiffResult Sized(Bitmap left, Bitmap right, bool binaryEqual, long pixels, List<string> notes) => new()
    {
        SameDimensions = true,
        FilesBinaryEqual = binaryEqual,
        LeftWidth = left.Width,
        LeftHeight = left.Height,
        RightWidth = right.Width,
        RightHeight = right.Height,
        TotalPixels = pixels,
        Detail = string.Join(" ", notes)
    };

    private static long Count(Bitmap left, Bitmap right, Bitmap? heat, int tolerance, CancellationToken cancellationToken)
    {
        var rect = new Rectangle(0, 0, left.Width, left.Height);
        var leftData = left.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var rightData = right.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        BitmapData? heatData = null;
        if (heat is not null)
            heatData = heat.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try
        {
            var width = left.Width;
            var leftRow = new byte[Math.Abs(leftData.Stride)];
            var rightRow = new byte[Math.Abs(rightData.Stride)];
            var heatRow = heatData is null ? null : new byte[Math.Abs(heatData.Stride)];
            long different = 0;
            for (var y = 0; y < left.Height; y++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                Marshal.Copy(leftData.Scan0 + y * leftData.Stride, leftRow, 0, leftRow.Length);
                Marshal.Copy(rightData.Scan0 + y * rightData.Stride, rightRow, 0, rightRow.Length);
                for (var x = 0; x < width; x++)
                {
                    var i = x * 4;
                    var changed = Math.Abs(leftRow[i] - rightRow[i]) > tolerance
                        || Math.Abs(leftRow[i + 1] - rightRow[i + 1]) > tolerance
                        || Math.Abs(leftRow[i + 2] - rightRow[i + 2]) > tolerance
                        || Math.Abs(leftRow[i + 3] - rightRow[i + 3]) > tolerance;
                    if (changed)
                        different++;
                    if (heatRow is not null)
                    {
                        if (changed)
                        {
                            heatRow[i] = 40;
                            heatRow[i + 1] = 40;
                            heatRow[i + 2] = 220;
                            heatRow[i + 3] = 255;
                        }
                        else
                        {
                            heatRow[i] = leftRow[i];
                            heatRow[i + 1] = leftRow[i + 1];
                            heatRow[i + 2] = leftRow[i + 2];
                            heatRow[i + 3] = 90;
                        }
                    }
                }

                if (heatData is not null && heatRow is not null)
                    Marshal.Copy(heatRow, 0, heatData.Scan0 + y * heatData.Stride, heatRow.Length);
            }

            return different;
        }
        finally
        {
            left.UnlockBits(leftData);
            right.UnlockBits(rightData);
            if (heat is not null && heatData is not null)
                heat.UnlockBits(heatData);
        }
    }

    private static string Hash(string path, CancellationToken cancellationToken)
    {
        using var sha = SHA256.Create();
        using var stream = File.OpenRead(path);
        var buffer = new byte[128 * 1024];
        int read;
        while ((read = stream.Read(buffer)) > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            sha.TransformBlock(buffer, 0, read, null, 0);
        }

        sha.TransformFinalBlock([], 0, 0);
        return Convert.ToHexString(sha.Hash!);
    }
}
