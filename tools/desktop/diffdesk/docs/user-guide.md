# User guide

DiffDesk compares folders and files on your computer. It does not ask for an account and it does not upload file contents.

## Window

`DiffDesk.exe` opens the home tab. New starts a folder, text, merge, sync, image, table, binary, JSON, XML, or document comparison. F5 compares the active tab. Ctrl+S saves the active editor, merged file, or HTML report. Ctrl+O browses for the left or base path. Ctrl+Tab moves to the next tab.

Light, dark, and system themes are under View. Settings are stored in `%LOCALAPPDATA%\DiffDesk`.

Double-click a file in a folder result to open it in the matching viewer. A folder row stays in the tree. A reparse point is skipped.

## Folder comparison

Size and timestamp are on by default. Timestamps within two seconds count as the same. Content, hash, and text rules are off until you check them. "Skip build folders" adds excludes for `.git`, `bin`, `obj`, `node_modules`, and `.vs`. You can add your own globs, one per line. A glob without a slash matches the file name.

Save HTML report writes the current result. The report does not include file contents beyond the path, status, and detail.

## Text

Open two text files. Encoding is detected from a BOM, then strict UTF-8, then Windows-1252. The original encoding and the majority newline are kept when you save, and a `.bak` file is written beside the original. Find and Replace all edit the open text and leave the hunk list stale until you compare again. Copy hunk works against the last comparison only.

## Merge

Choose base, left, and right. Non-overlapping edits are applied. The same edit on both sides is kept once. Overlapping different edits stay as conflicts with `<<<<<<< LEFT` markers. Use left, use right, or use both. Saving with conflicts asks first.

## Sync

Preview does not change files. Update copies missing and different files and does not delete. Mirror can delete destination-only items, and Execute asks before it deletes. Two-way copies files that exist on only one side and marks files that differ on both sides as conflicts. Use left, Use right, or Skip before you execute a conflict. Undo last run restores the journal from that session.

## Command line

`diffdesk.exe` is the command-line build.

```
diffdesk compare <left> <right> [--content] [--hash] [--text] [--exclude PATTERN]
diffdesk text <left> <right> [--ignore-case] [--ignore-whitespace] [--ignore-blank-lines]
diffdesk report <left> <right> [--format text|json|html|csv] [--output FILE] [--content]
diffdesk sync <left> <right> [--mode update-right|update-left|mirror-right|mirror-left|two-way] [--execute] [--confirm-deletes]
diffdesk merge <base> <left> <right> [--output FILE] [--force]
```

Exit codes: 0 same or success, 1 differences, 2 usage or runtime error, 3 unresolved merge or sync conflicts.

`--execute` applies a sync plan. Deletes also need `--confirm-deletes`. Without `--execute` the command only prints the plan.

## Explorer

`scripts/install-context-menu.ps1` adds two current-user folder commands after you publish. One stores a left folder. The next compare uses that stored folder as the left side. `scripts/uninstall-context-menu.ps1` removes them. The app does not run this script.
