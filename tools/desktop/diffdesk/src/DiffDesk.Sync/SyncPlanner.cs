using DiffDesk.Domain;

namespace DiffDesk.Sync;

public sealed class SyncPlanner : ISynchronizationPlanner
{
    public SyncPlan Plan(FolderComparisonResult comparison, SyncMode mode)
    {
        var blocking = PathSafety.OverlapMessage(comparison.LeftRoot, comparison.RightRoot);
        var operations = new List<SyncOperation>();
        if (blocking is null && string.IsNullOrEmpty(comparison.FatalError))
        {
            foreach (var entry in comparison.Entries)
                operations.Add(Build(entry, mode));
        }

        long? free = null;
        try
        {
            var root = Path.GetPathRoot(mode is SyncMode.MirrorRightToLeft or SyncMode.UpdateLeftFromRight ? comparison.LeftRoot : comparison.RightRoot);
            if (!string.IsNullOrEmpty(root))
                free = new DriveInfo(root).AvailableFreeSpace;
        }
        catch (ArgumentException)
        {
            free = null;
        }
        catch (IOException)
        {
            free = null;
        }

        return new SyncPlan
        {
            Mode = mode,
            LeftRoot = comparison.LeftRoot,
            RightRoot = comparison.RightRoot,
            Operations = operations,
            BlockingError = blocking ?? comparison.FatalError,
            EstimatedBytes = operations.Where(static op => op.Selected && op.Action is SyncAction.Copy or SyncAction.Update).Sum(static op => op.Bytes ?? 0),
            CopyCount = operations.Count(static op => op.Action == SyncAction.Copy),
            UpdateCount = operations.Count(static op => op.Action == SyncAction.Update),
            DeleteCount = operations.Count(static op => op.Action == SyncAction.Delete),
            ConflictCount = operations.Count(static op => op.Action == SyncAction.Conflict),
            SkipCount = operations.Count(static op => op.Action == SyncAction.Skip),
            DestinationFreeBytes = free
        };
    }

    private static SyncOperation Build(FolderEntry entry, SyncMode mode)
    {
        if (entry.Status is CompareStatus.Error or CompareStatus.Unreadable)
            return Make(entry, SyncAction.Skip, SyncDirection.None, false, "The item could not be read, so it was left alone.");

        if (entry.Kind == EntryKind.ReparsePoint)
            return Make(entry, SyncAction.Skip, SyncDirection.None, false, "Reparse points are not copied.");
        if (entry.Status == CompareStatus.Identical || (entry.ContentChecked && entry.ContentEqual))
            return Make(entry, SyncAction.Skip, SyncDirection.None, false, "The contents match.");

        return mode switch
        {
            SyncMode.MirrorLeftToRight => Mirror(entry, toRight: true),
            SyncMode.MirrorRightToLeft => Mirror(entry, toRight: false),
            SyncMode.UpdateRightFromLeft => Update(entry, toRight: true),
            SyncMode.UpdateLeftFromRight => Update(entry, toRight: false),
            _ => TwoWay(entry)
        };
    }

    private static SyncOperation Mirror(FolderEntry entry, bool toRight)
    {
        if (toRight && entry.Status == CompareStatus.LeftOnly)
            return Make(entry, SyncAction.Copy, SyncDirection.LeftToRight, false, null);
        if (toRight && entry.Status == CompareStatus.RightOnly)
            return Make(entry, SyncAction.Delete, SyncDirection.None, true, "Mirror deletes items that exist only on the destination.");
        if (!toRight && entry.Status == CompareStatus.RightOnly)
            return Make(entry, SyncAction.Copy, SyncDirection.RightToLeft, false, null);
        if (!toRight && entry.Status == CompareStatus.LeftOnly)
            return Make(entry, SyncAction.Delete, SyncDirection.None, true, "Mirror deletes items that exist only on the destination.");
        return Make(entry, entry.Kind == EntryKind.Directory ? SyncAction.Skip : SyncAction.Update, toRight ? SyncDirection.LeftToRight : SyncDirection.RightToLeft, false, entry.Kind == EntryKind.Directory ? "Both folders exist." : null);
    }

    private static SyncOperation Update(FolderEntry entry, bool toRight)
    {
        if (toRight && entry.Status == CompareStatus.RightOnly)
            return Make(entry, SyncAction.Skip, SyncDirection.None, false, "Update does not delete destination-only files.");
        if (!toRight && entry.Status == CompareStatus.LeftOnly)
            return Make(entry, SyncAction.Skip, SyncDirection.None, false, "Update does not delete destination-only files.");
        if (toRight && entry.Status == CompareStatus.LeftOnly)
            return Make(entry, SyncAction.Copy, SyncDirection.LeftToRight, false, null);
        if (!toRight && entry.Status == CompareStatus.RightOnly)
            return Make(entry, SyncAction.Copy, SyncDirection.RightToLeft, false, null);
        return Make(entry, entry.Kind == EntryKind.Directory ? SyncAction.Skip : SyncAction.Update, toRight ? SyncDirection.LeftToRight : SyncDirection.RightToLeft, false, null);
    }

    private static SyncOperation TwoWay(FolderEntry entry)
    {
        if (entry.Status == CompareStatus.LeftOnly)
            return Make(entry, SyncAction.Copy, SyncDirection.LeftToRight, false, null);
        if (entry.Status == CompareStatus.RightOnly)
            return Make(entry, SyncAction.Copy, SyncDirection.RightToLeft, false, null);
        return Make(entry, SyncAction.Conflict, SyncDirection.None, true, "Both sides differ. Choose a direction. The newer file is not assumed to be correct.");
    }

    private static SyncOperation Make(FolderEntry entry, SyncAction action, SyncDirection direction, bool confirm, string? detail)
    {
        long? bytes = direction == SyncDirection.RightToLeft ? entry.RightLength : entry.LeftLength;
        long? sourceLength = direction == SyncDirection.RightToLeft ? entry.RightLength : entry.LeftLength;
        DateTimeOffset? sourceModified = direction == SyncDirection.RightToLeft ? entry.RightModified : entry.LeftModified;
        long? destLength = direction == SyncDirection.RightToLeft ? entry.LeftLength : entry.RightLength;
        DateTimeOffset? destModified = direction == SyncDirection.RightToLeft ? entry.LeftModified : entry.RightModified;
        if (action == SyncAction.Delete)
        {
            sourceLength = entry.RightLength ?? entry.LeftLength;
            sourceModified = entry.RightModified ?? entry.LeftModified;
            bytes = sourceLength;
        }

        return new SyncOperation
        {
            Id = Guid.NewGuid().ToString("N"),
            Action = action,
            Direction = direction,
            RelativePath = entry.RelativePath,
            Kind = entry.Kind,
            Bytes = bytes,
            Detail = detail,
            RequiresConfirmation = confirm,
            Selected = action is SyncAction.Copy or SyncAction.Update or SyncAction.Delete,
            SourceLength = sourceLength,
            SourceModified = sourceModified,
            DestinationLength = action == SyncAction.Update ? destLength : null,
            DestinationModified = action == SyncAction.Update ? destModified : null,
            Status = action == SyncAction.Skip ? "No change" : action == SyncAction.Conflict ? "Needs a decision" : "Pending"
        };
    }
}
