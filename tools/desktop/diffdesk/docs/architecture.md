# Architecture

DiffDesk is a Windows desktop tool. The comparison engines do not reference the window code, so the command line and the tests call the same services as the app.

```
DiffDesk.Domain          models and service interfaces
DiffDesk.Comparison      folder, text, merge, JSON, XML, CSV, XLSX, image, binary, PDF, DOCX
DiffDesk.Sync            preview planner and the executor that applies a plan
DiffDesk.Application     text, JSON, CSV, and HTML reports
DiffDesk.Infrastructure  settings, sessions, logging, file watching, dependency wiring
DiffDesk.Cli             diffdesk.exe
DiffDesk.Desktop         Avalonia window
```

A folder scan records size and last-write time unless you turn those off. Content, hash, and text rules are separate options so a large tree is not read by default. The sync planner turns a finished comparison into copy, update, delete, skip, and conflict rows. The executor refuses a plan whose folders overlap, rechecks size and time before it writes, and keeps a journal under the recovery folder. Deletes run only when the caller passes confirmation.

Sessions and settings are JSON files in `%LOCALAPPDATA%\DiffDesk`. They store paths and options, not the contents of the files you compared.
