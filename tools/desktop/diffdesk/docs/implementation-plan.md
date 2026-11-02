# Implementation plan

The product spec is `DIFFDESK.md` at the repo root. This folder is the tool.

## Done in this tree

- Domain models, path checks, and service interfaces.
- Folder scan, filters, text diff, three-way merge, JSON, XML, CSV, XLSX, images, binary, PDF text, and DOCX text.
- Sync preview and executor with overlap refusal, backups, journal undo, and non-recursive folder delete.
- Reports, sessions, settings, daily log, and file watch.
- `diffdesk` command with the exit codes in the user guide.
- Avalonia window wired to those services.
- Unit and integration tests.
- Publish script for a self-contained `win-x64` folder.

## Not done

- An installer. WiX and Inno Setup were not required for the app to run, and this build does not add one.
- Code signing.
- A measured 10,000-file or multi-gigabyte run. Set `DIFFDESK_PERF=1` before treating those as results.
- Click-through of every window. The desktop project builds, and the process smoke check is recorded in `progress.md`.

## Branch

`feature/diffdesk` starts from `feature/file-studio` after the File Studio commit. `main` is still the older FolderToExcel commit and does not have the `tools/` layout, so this branch was not created from `main`.
