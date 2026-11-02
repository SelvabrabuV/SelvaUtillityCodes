# Read Folders to Excel

Lists the files in each immediate subfolder of a folder you pick, and writes them to an Excel workbook.

| | |
| --- | --- |
| Id | `read-folders-to-excel` |
| Platform | desktop |
| Tech | VBScript, Excel |
| Status | usable |

## Run

Windows with desktop Excel installed. From this folder:

```
wscript src\ReadFoldersToExcel.vbs
```

Excel opens, asks for a folder path, then saves `FolderStructure.xlsx` in that folder.

## Behavior

- Uses only the immediate subfolders of the folder you enter. Files sitting directly in that folder are ignored.
- One worksheet per subfolder. The sheet name is the subfolder name, cut to 31 characters.
- Column A is `Filename`, then one file name per row.
- Skips any file whose name contains `-meta.xml`.
- Does not recurse into deeper folders.

## Limits

- Two subfolders whose names match in the first 31 characters will collide. Excel cannot have two sheets with the same name.
- The script shows Excel while it runs and overwrites `FolderStructure.xlsx` if that file is already in the folder.
