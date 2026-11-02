# DiffDesk

Offline Windows app to compare folders and files, merge text, and sync with a preview. It does not ask for an account or send file contents anywhere.

| | |
| --- | --- |
| Id | `diffdesk` |
| Platform | desktop |
| Tech | C#, .NET 10, Avalonia |
| Status | usable |

## Run

Build and tests need Windows 10 or 11 and the .NET SDK 10.

```
cd tools/desktop/diffdesk
dotnet test DiffDesk.slnx -c Debug
dotnet run --project src/DiffDesk.Desktop
```

The window project is `DiffDesk`. The command line is a separate executable:

```
dotnet run --project src/DiffDesk.Cli -- compare samples/left samples/right
```

`diffdesk --help` lists `compare`, `text`, `report`, `sync`, and `merge`. Exit codes are 0 (same or success), 1 (differences), 2 (usage or runtime error), and 3 (unresolved merge or sync conflicts).

## Package

```
powershell -File scripts/publish-win.ps1
```

The destination needs about 1500 MB free. If it does not, set `DIFFDESK_PUBLISH_ROOT` to a folder on another drive and run the script again. When the Windows profile drive has under 800 MB free, that run also stores NuGet packages under the publish folder.

This writes self-contained `win-x64` folders:

- `artifacts/DiffDesk-win-x64/DiffDesk.exe` (or under `DIFFDESK_PUBLISH_ROOT`)
- `artifacts/diffdesk-cli-win-x64/diffdesk.exe`

`artifacts/` is gitignored. The executables are not signed. There is no installer in this build. `scripts/install-context-menu.ps1` can add two current-user Explorer commands after you publish. The app does not run that script. `scripts/uninstall-context-menu.ps1` removes those commands.

## Behavior

A folder compare uses size and last-write time unless you turn those off. Timestamps within two seconds count as the same. Content, hash, and text checks stay off until you ask for them. Sync previews a plan and does not write until you execute it. Mirror deletes need confirmation. Sessions in `%LOCALAPPDATA%\DiffDesk` store paths and options, not the contents of the files you compared.

Samples under `samples/left` and `samples/right` are small text, CSV, and JSON pairs for a first compare.

## Where things live

This tool is a .NET solution, `DiffDesk.slnx`, because the engines, the command line, the window, and the tests are separate projects. A single file under `src/` would not keep that split. The projects are:

| Project | Role |
| --- | --- |
| `src/DiffDesk.Domain` | Models and service interfaces |
| `src/DiffDesk.Comparison` | Folder, text, merge, JSON, XML, CSV, XLSX, image, binary, PDF, and DOCX |
| `src/DiffDesk.Sync` | Plan, then apply that plan |
| `src/DiffDesk.Application` | Text, JSON, CSV, and HTML reports |
| `src/DiffDesk.Infrastructure` | Settings, sessions, logging, and wiring |
| `src/DiffDesk.Cli` | `diffdesk` command line |
| `src/DiffDesk.Desktop` | Avalonia window |
| `tests/DiffDesk.UnitTests` | Engine tests on temporary folders |
| `tests/DiffDesk.IntegrationTests` | Command line, sessions, and a 2,000-file scan |

See `docs/architecture.md`, `docs/user-guide.md`, and `docs/known-limitations.md`.

## Limits

PDF and DOCX comparison uses extracted text. Images use Windows GDI+ and stop above 40 megapixels. Binary compare does not edit bytes. The published folder is unsigned. The published window was started and closed. Its tabs and buttons were not clicked in that check. Details are in `docs/known-limitations.md`.
