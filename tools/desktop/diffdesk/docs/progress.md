# Progress

Recorded 2026-11-02 from commands run in this worktree. Times below are that run only.

## Tests

Debug.

- `DiffDesk.UnitTests`: 22 passed, 0 failed. About 1 second.
- `DiffDesk.IntegrationTests`: 8 passed, 0 failed. Total time 4.0580 seconds.
- `MetadataScan_TwoThousandFiles` printed `DIFFDESK_2000_SECONDS 0.296`. The test fails only if the scan takes 60 seconds or more. That bound is a hang check.
- `OptionalLargeScans_RunOnlyWhenRequested` finished in about 5 milliseconds because `DIFFDESK_PERF` was unset. No 10,000-file, 100 MB, or 1 GB time was measured.

## Desktop build

`dotnet build src/DiffDesk.Desktop/DiffDesk.Desktop.csproj -c Debug` succeeded with 0 warnings and 0 errors. A later Release publish compiled the `--version` stdout fix.

## Publish

`scripts/publish-win.ps1` failed on the first attempt. C: had about 0.2 GB free, and after DiffDesk `bin` and `obj` were deleted it still had about 650 MB. A later run of that same script, with about 2174 MB free on C:, completed and wrote `artifacts/`. The `_msbuild` intermediate folder from that run was removed afterward.

The same Release `win-x64` `--self-contained true` publish was then run with NuGet packages and MSBuild intermediates on `D:\diffdesk-build`. It completed. Measured folders:

- Desktop 224.7 MB
- Command line 94.6 MB

Those folders were copied to `tools/desktop/diffdesk/artifacts/`. `artifacts/` is gitignored. The temporary `D:\diffdesk-build` tree was removed after the copy. `candle` and `iscc` are not installed, so there is no installer.

## Smoke

From `artifacts/`:

- `DiffDesk.exe --version` wrote `DiffDesk 1.0.0` and exited 0.
- `diffdesk.exe --version` wrote `DiffDesk 1.0.0` and exited 0.
- `diffdesk compare samples/left samples/right` exited 1 and printed `3 items, 2 different`, naming `notes.txt` and `people.csv`.
- `DiffDesk.exe` was started with no arguments, was still running after a few seconds, and was then closed. Tabs and buttons were not clicked.

## Branch

The files were written in a worktree that was already on `feature/file-studio` and also had uncommitted File Studio edits. Those File Studio edits were left uncommitted here. The DiffDesk commit is on `feature/diffdesk`, starting from `feature/file-studio` after its File Studio commit. `main` does not yet contain the `tools/` layout.
