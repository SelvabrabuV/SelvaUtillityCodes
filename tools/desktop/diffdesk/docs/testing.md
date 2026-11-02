# Testing

From `tools/desktop/diffdesk`, with the .NET 10 SDK:

```
dotnet test DiffDesk.slnx -c Debug
```

Tests create temporary folders. They do not read your documents. The always-on performance check compares 2,000 small files by size and timestamp and prints `DIFFDESK_2000_SECONDS` with the measured time. It fails if that scan takes 60 seconds or more. That bound is a hang check, not a performance claim.

Larger scans stay off unless you set `DIFFDESK_PERF=1`. This build did not run the 10,000-file, 100 MB, or 1 GB cases. Do not quote a time for them.

A junction test uses `mklink /J`. If Windows refuses the link, that test returns without a measurement. Image tests use GDI+ bitmaps. PDF extraction uses a tiny generated PDF. If the extractor cannot read it, the test still requires a warning instead of a throw.
