# MASTER DEVELOPMENT PROMPT — DIFFDESK

## 1. Your Role

Act as a Principal Software Architect, Senior C# Desktop Developer, File System Engineer, and UI/UX Designer.

Your task is to design and implement a complete, production-quality desktop file and folder comparison application named **DiffDesk**, inspired by the functionality of Beyond Compare 5.

This must be a real, working desktop application, not a UI prototype, conceptual demonstration, or collection of placeholder methods.

Implement the comparison engines, interactive UI, editing, merging, synchronization, error handling, automated tests, packaging, and documentation.

**Core requirements:**
- Windows-first desktop application.
- Fully functional offline.
- No backend server or user authentication.
- No subscription or mandatory cloud dependencies.
- Fast and responsive with large files and directory trees.
- Reliable, safe, and reversible file operations wherever feasible.
- Modern professional interface with dark and light themes.
- Modular architecture supporting future extensions.
- Release a self-contained Windows executable.

Use Beyond Compare as a functional reference, but create an original interface, branding, assets, and implementation. Do not copy proprietary source code or artwork.

---

## 2. Technology Stack

Use the following preferred technologies:

| Component | Technology |
|---|---|
| Language | C# |
| Framework | .NET 10 LTS |
| Desktop UI | Avalonia UI |
| Architecture | MVVM and Clean Architecture |
| Text diff engine | DiffPlex |
| Folder comparison | Custom filesystem comparison engine |
| Three-way merge | DiffPlex plus custom conflict resolution |
| File monitoring | FileSystemWatcher with rescan reconciliation |
| Settings and saved sessions | JSON and SQLite when warranted |
| Excel support | ClosedXML or equivalent |
| CSV support | CsvHelper or equivalent |
| Image comparison | ImageSharp or equivalent |
| PDF text comparison | PdfPig or equivalent text extraction library |
| Logging | Serilog or equivalent |
| Testing | xUnit or equivalent |
| Packaging | dotnet publish and Windows installer |

Verify package compatibility, supported APIs, versions, and licensing before installation. Prefer permissively licensed dependencies suitable for redistribution.

Maintain a clean separation between UI, application services, comparison engines, filesystem operations, and persistence.

---

## 3. Main Application Layout

Create a professional IDE-like desktop interface.

### Main Window

Top menu:
- File
- Edit
- View
- Compare
- Merge
- Synchronize
- Tools
- Sessions
- Settings
- Help

Toolbar:
- New comparison
- Open files
- Open folders
- Compare
- Refresh
- Next difference
- Previous difference
- Copy left to right
- Copy right to left
- Merge
- Synchronize
- Save session

### Home Dashboard

Provide launch cards for:

1. Folder Compare
2. Text Compare
3. Text Merge
4. Folder Synchronization
5. Table Compare
6. Image Compare
7. Binary / Hex Compare
8. Structured Data Compare
9. Saved Sessions

Show recently opened comparison sessions.

Use tabs to manage multiple simultaneous comparisons.

Allow tabs to be reordered, closed, duplicated, and restored.

Support keyboard shortcuts, drag and drop, resizable panels, high-DPI displays, and customizable themes.

---

# 4. MODULE 1 — FOLDER COMPARISON

This is a critical module and must be implemented first.

## Folder Selection

Provide two folder selectors:

LEFT DIRECTORY and RIGHT DIRECTORY.

Allow:
- Manual directory paths
- Browse dialogs
- Drag-and-drop directories
- Recent directory selection
- UNC/network paths
- Swapping left/right directories
- Refreshing a comparison

## Folder Comparison Engine

Recursively enumerate files and directories on both sides.

Compare using configurable methods:

1. Filename and relative path
2. File size
3. Last modified timestamp
4. Binary content
5. SHA-256 checksum
6. Text-aware comparison

Support timestamp tolerance and case-sensitivity settings.

Classify files as:

- Identical
- Different
- Left only
- Right only
- Left newer
- Right newer
- Unreadable
- Comparison pending
- Comparison error

Do not treat newer timestamps alone as proof of different contents.

Use consistent comparison rules for all folder and file status classifications.

## Folder Comparison Interface

Display a two-sided synchronized file explorer.

Example:

```text
LEFT DIRECTORY                  RIGHT DIRECTORY

project/                        project/
  src/                            src/
    app.cs        Modified          app.cs
    config.json   Identical         config.json
    old.cs        Left Only
                                  new.cs   Right Only

  README.md       Different        README.md
```

Display columns:
- Filename
- Relative path
- Size
- Modified date
- Comparison status
- File type

Provide color-coded file states with accessible icons and text descriptions.

Allow sorting, filtering, searching, expanding/collapsing, and selecting multiple files.

Double-clicking a different file must launch the appropriate comparison viewer.

## Filtering

Implement:
- Include extensions
- Exclude extensions
- Glob patterns
- Directory exclusions
- Hidden/system files
- File size thresholds
- Timestamp ranges
- Files with differences only
- Left-only or right-only results

Examples:

```text
**/bin/**
**/obj/**
**/node_modules/**
**/.git/**
*.log
*.tmp
```

Ensure exclusions work recursively and do not unexpectedly suppress explicitly selected files.

## Performance

Requirements:
- Background scanning
- Bounded parallel processing
- Cancellation support
- Streaming progress reporting
- Lazy-loading directory nodes
- Incremental UI updates
- Efficient memory usage
- Cache results with appropriate invalidation
- Avoid hashing all files unnecessarily

Design and test using sample directory trees containing 100,000 or more files.

Never freeze the UI while scanning.

---

# 5. MODULE 2 — TEXT AND SOURCE CODE COMPARISON

Create an advanced text comparison editor.

## File Types

Support plain text and common source/configuration formats:

- TXT
- CS
- JAVA
- JS / JSX
- TS / TSX
- HTML
- CSS
- XML
- JSON
- YAML
- SQL
- PY
- MD
- Apex
- LWC-related source files
- Configuration files

Unknown text formats should still work as plain text.

## Editor Interface

Display two editable text panels.

LEFT FILE | RIGHT FILE

Required:
- Line numbers
- Syntax highlighting
- Word wrapping
- Horizontal and vertical scrolling
- Synchronized scrolling
- Current line highlighting
- Search and replace
- Go to line
- Character-level differences
- Line-level differences
- Difference overview/minimap
- Status bar
- Encoding indicator
- End-of-line indicator

## Comparison Features

Identify:
- Added lines
- Removed lines
- Modified lines
- Identical lines
- Whitespace differences
- Character-level differences

Allow comparison settings:
- Ignore case
- Ignore leading/trailing whitespace
- Ignore all whitespace
- Ignore blank lines
- Normalize line endings for comparison
- Preserve original formatting when saving

Implement both:
1. Side-by-side comparison
2. Unified diff view

Highlight differences at word/character level when possible.

Provide next/previous difference navigation.

## Copy and Merge Operations

Add gutter controls or toolbar actions to:

- Copy selected change left to right
- Copy selected change right to left
- Copy individual difference blocks
- Copy all eligible differences
- Reject a selected change
- Undo/redo editing changes

Ensure that the destination document is genuinely modified.

Track unsaved changes.

Prompt before discarding edits.

Support atomic saving with a temporary file, appropriate backups, and preservation of encoding and line endings when practical.

## Diff Algorithms

Use DiffPlex where suitable.

Consider Myers diff for efficient exact line matching and optional patience-style alignment for source files.

Separate the diff model from UI rendering.

For large files, avoid repeatedly recomputing the entire document on every keystroke.

---

# 6. MODULE 3 — THREE-WAY TEXT MERGE

Implement a professional three-way merge tool.

Inputs:

```text
BASE FILE
LEFT MODIFIED FILE
RIGHT MODIFIED FILE
```

Output:

```text
MERGED RESULT
```

Detect:
- Changes made only on the left
- Changes made only on the right
- Compatible changes on both sides
- Conflicting changes
- Deleted/replaced content
- Identical simultaneous changes

Support:
- Accept left
- Accept right
- Accept both when valid
- Edit merged output manually
- Automatic resolution of non-conflicting changes
- Explicit unresolved conflict markers or UI indicators
- Save merged result to a selected destination

Never silently resolve conflicting edits.

Provide a conflict counter and next/previous conflict buttons.

Warn before saving unresolved conflicts.

Create automated tests for simultaneous insertions, overlapping edits, deletions, and non-overlapping modifications.

---

# 7. MODULE 4 — FOLDER SYNCHRONIZATION

Implement safe, bidirectional file synchronization.

## Synchronization Modes

1. Mirror left to right
2. Mirror right to left
3. Update right from left
4. Update left from right
5. Two-way synchronization
6. Custom selected operations

Distinguish mirror behavior from update behavior.

Mirror may require deletion of destination-only files; update must not.

## Synchronization Preview

Before any filesystem modification, produce an operation plan.

Show:

| Operation | Source | Destination | Status |
|---|---|---|---|
| Copy | Left | Right | Pending |
| Update | Right | Left | Pending |
| Delete | Right | — | Confirmation required |
| Skip | — | — | No change |
| Conflict | Both | — | Manual decision |

Display:
- Total files involved
- Files to copy
- Files to replace
- Files to delete
- Conflicts
- Estimated transfer bytes
- Available disk space where relevant

## Safety Requirements

- Dry-run preview by default.
- Never delete without explicit confirmation.
- Never assume the newer file is always correct.
- Protect against accidental synchronization of unrelated directories.
- Detect overlapping source/destination directories.
- Prevent recursive self-copying.
- Revalidate source and destination metadata before execution.
- Preserve files safely if a process is interrupted.
- Handle permission failures and locked files.
- Support cancellation between safe operation boundaries.
- Use bounded retries for recoverable errors.
- Prevent directory traversal through malicious paths.
- Handle symlinks, junctions, and reparse points according to explicit policy.

## Backups and Recovery

Before destructive replacement/deletion:
- Create a backup or recovery snapshot where possible.
- Maintain an operation journal.
- Record completed, pending, and failed operations.
- Support recovery after interruption.
- Provide undo for operations whose original data is retained.

Do not advertise full rollback unless every required backup and recovery operation is actually supported.

## Sync Results

Display:
- Completed operations
- Skipped operations
- Errors
- Conflicts
- Duration
- Bytes transferred

Support exporting an operation report.

---

# 8. MODULE 5 — TABLE, CSV AND EXCEL COMPARISON

Build a structured table comparison viewer.

Supported formats:
- CSV
- TSV
- XLSX

## Features

Compare:
- Columns
- Rows
- Cell values
- Missing/added columns
- Missing/added rows
- Data types
- Null and blank values
- Duplicate records

Allow row matching by:
- Row position
- Selected primary-key column
- Composite key

Detect duplicate keys and surface them as ambiguity rather than choosing arbitrary matches.

Show a spreadsheet-like comparison interface.

Use cell-level difference highlighting.

Provide:
- Sheet selection
- Header row selection
- Ignore selected columns
- Ignore row ordering
- Case/whitespace normalization
- Search/filter
- Export differences to CSV/XLSX
- Export comparison summary

Start with value-level comparison. Document limitations regarding formulas, formatting, macros, and calculation caches.

Never execute spreadsheet macros or untrusted formulas.

---

# 9. MODULE 6 — JSON AND XML COMPARISON

Create a semantic comparison engine for structured documents.

## JSON

Features:
- Validate and parse JSON
- Tree viewer
- Raw text viewer
- Syntax highlighting
- Expand/collapse nodes
- Compare values
- Detect missing keys
- Detect changed types
- Handle deeply nested objects and arrays

Allow object property-order differences to be ignored.

Make array comparison policy configurable:
- Positional
- Key-based where possible
- Order-sensitive or order-insensitive where semantically appropriate

Show JSON paths for differences.

Example:

```text
$.customer.address.city
$.policy.status
$.items[2].quantity
```

## XML

Features:
- XML syntax validation
- Tree view
- Element comparison
- Attribute comparison
- Namespace-aware comparisons
- Text value comparison
- Optional attribute-order normalization
- Configurable insignificant-whitespace handling
- XPath-style difference location reporting

Use secure parsers.

Disable unsafe external entity resolution and DTD processing unless a secure, explicitly configured use case requires them.

Allow navigation from the tree difference to the raw source.

---

# 10. MODULE 7 — IMAGE COMPARISON

Supported formats:
- PNG
- JPG/JPEG
- BMP
- GIF
- WEBP where supported by the selected library

Features:
- Side-by-side viewer
- Synchronized zoom
- Pan
- Fit-to-screen
- Actual pixel size
- Image dimensions
- Transparency checkerboard
- Overlay comparison
- Adjustable overlay opacity
- Pixel difference heatmap
- Difference percentage
- Optional comparison tolerance

Clearly distinguish decoded pixel equality from binary file equality.

Handle images with different dimensions.

Do not silently resize the source images before computing exact pixel differences.

---

# 11. MODULE 8 — BINARY AND HEX COMPARISON

Implement a binary comparison editor/viewer.

Features:
- Byte-offset display
- Hexadecimal representation
- ASCII representation
- Changed byte highlighting
- Next/previous changed region
- File size
- SHA-256 checksum
- Binary equality checks
- Export difference ranges

Support streaming and chunked reads.

Avoid loading multi-gigabyte files entirely into memory.

Binary editing can be added after a reliable read-only comparison engine is complete.

---

# 12. MODULE 9 — PDF AND DOCUMENT COMPARISON

Implement useful document comparison capabilities.

Initial supported formats:
- PDF
- DOCX

Provide:
- Extracted text comparison
- Page/paragraph mapping when available
- Side-by-side text differences
- Search
- Difference navigation
- Export of difference reports

PDF extraction must preserve page references where possible.

Clearly label text-extraction results as different from visual page comparison.

For scanned PDFs, report that OCR is unavailable unless a real OCR engine is implemented.

Preserve the original documents.

Do not claim PDF/DOCX editing or exact visual comparison until those features are implemented and tested.

---

# 13. MODULE 10 — SAVED SESSIONS AND WORKSPACES

Allow users to save comparison sessions.

Session fields:
- Session name
- Comparison type
- Left file/folder
- Right file/folder
- Base file for three-way merges
- Comparison settings
- Filters
- Layout
- Last opened timestamp
- View preferences

Allow:
- Save
- Rename
- Delete
- Duplicate
- Reopen
- Export/import session configuration

Workspaces should save multiple open tabs.

Store configuration locally.

Do not store document contents unnecessarily.

---

# 14. MODULE 11 — POWER USER FEATURES

Implement:

### Command-line interface

Examples:

```powershell
diffdesk compare "C:\ProjectA" "C:\ProjectB"

diffdesk text "C:\old.cs" "C:\new.cs"

diffdesk report "C:\A" "C:\B" --format json
```

CLI must return documented exit codes suitable for automation.

### Context Menu Integration

Support:

- Compare with DiffDesk
- Select as left side
- Compare with previously selected item

Make shell integration optional and uninstallable.

### File Change Monitoring

Use filesystem notifications to mark comparisons as stale.

Coalesce rapid changes and allow rescanning.

Do not rely solely on FileSystemWatcher events, which can be missed or overflow.

### Reports

Export:
- HTML
- JSON
- CSV
- Plain text

Include counts and file-level differences.

### Keyboard Shortcuts

Examples:
- Ctrl+O: Open
- Ctrl+S: Save
- Ctrl+F: Find
- F5: Refresh
- F7: Previous difference
- F8: Next difference
- Ctrl+Tab: Next tab

Allow shortcut customization if practical.

---

# 15. UX AND DESIGN REQUIREMENTS

Create a polished desktop UI, not a generic administrative dashboard.

Design principles:
- Compact, information-dense interface
- Clear visual hierarchy
- Resizable split panels
- Fast navigation
- Accessible status indicators
- Proper keyboard focus
- Consistent context menus
- Persistent window size and layout
- Dark/light/system themes
- Smooth scrolling
- Minimal unnecessary animations

Use color consistently for change classifications.

Always show explanatory status text in addition to color.

Support light and dark themes, high-DPI scaling, and ordinary keyboard-only interaction.

Display long-running operation progress without freezing the interface.

Never show buttons that have no implemented functionality.

---

# 16. APPLICATION ARCHITECTURE

Create a multi-project solution similar to:

```text
DiffDesk/
|
+-- src/
|   +-- DiffDesk.Desktop/
|   +-- DiffDesk.Application/
|   +-- DiffDesk.Domain/
|   +-- DiffDesk.Infrastructure/
|   +-- DiffDesk.Comparison/
|   +-- DiffDesk.Sync/
|   +-- DiffDesk.Cli/
|
+-- tests/
|   +-- DiffDesk.UnitTests/
|   +-- DiffDesk.IntegrationTests/
|
+-- docs/
|   +-- architecture.md
|   +-- implementation-plan.md
|   +-- user-guide.md
|   +-- testing.md
|
+-- samples/
|
+-- scripts/
|
+-- README.md
|
+-- DiffDesk.sln
```

Use dependency injection and interfaces for important services.

Recommended contracts:

```csharp
IFileComparisonService
IFolderComparisonService
ITextDiffService
IThreeWayMergeService
IStructuredDiffService
ITableComparisonService
IImageComparisonService
IBinaryComparisonService
ISynchronizationPlanner
ISynchronizationExecutor
IBackupService
ISessionRepository
IFileSystemService
IComparisonReportService
```

The comparison engines must not depend on Avalonia UI.

The synchronization planner must be separate from its executor.

The executor must never independently infer destructive operations outside the approved plan.

Use asynchronous APIs for filesystem operations wherever appropriate.

Keep UI view models thin.

Handle exceptions at meaningful service boundaries.

---

# 17. ERROR HANDLING AND SECURITY

Handle:

- Missing files
- Deleted folders during scanning
- Invalid paths
- Access denied
- Files locked by other programs
- Different file encodings
- Corrupted documents
- Unsupported file formats
- Insufficient disk space
- Interrupted synchronization
- Unavailable network drives
- Excessively long paths
- Symlink loops
- Windows junctions
- Duplicate filenames on case-sensitive filesystems

Do not crash the application for individual file comparison failures.

Show actionable errors.

Log technical diagnostic information without unnecessarily storing sensitive file contents.

Do not execute compared files, macros, embedded scripts, or document active content.

Ensure user-controlled file paths are validated at filesystem operation boundaries.

---

# 18. TESTING REQUIREMENTS

Automated testing is mandatory.

## Core Tests

Test:

- Identical files
- Different files
- Empty files
- Empty folders
- Nested directories
- Left-only and right-only files
- Different timestamps with identical contents
- Same file size but different contents
- Unicode text
- Mixed line endings
- Whitespace-only differences
- Three-way merge conflicts
- JSON nested differences
- XML namespace differences
- CSV duplicate keys
- Image pixel differences
- Binary byte differences
- File access failures
- File disappearance during scanning
- Cancellation during comparison
- Concurrent filesystem modification

## Synchronization Tests

Create temporary isolated folders and validate:

- One-way update
- One-way mirror
- Two-way sync
- Conflicting changes
- Dry-run operation plans
- Interrupted execution
- Backup creation
- Recovery
- Exclusion patterns
- Symlink and junction safety
- Prevention of source/destination overlap

Never run destructive integration tests against real user directories.

## Performance Tests

Include benchmark scenarios for:
- 10,000 files
- 100,000 files
- 100 MB text file
- 1 GB binary file

Measure elapsed time, peak memory, responsiveness, and cancellation behavior.

Report actual measured results. Do not invent performance metrics.

---

# 19. IMPLEMENTATION STRATEGY

Build the complete product incrementally using working vertical slices.

### Phase 1 — Desktop Foundation

- Create solution
- Configure Avalonia MVVM
- Create main window
- Implement navigation, tabs, themes
- Add settings and logging
- Add dependency injection
- Set up testing and build scripts

Deliver a launchable desktop application.

### Phase 2 — Folder Comparison

- Recursive scanner
- File metadata comparison
- Content/hash comparison
- Two-pane folder explorer
- Filters
- Progress/cancellation
- Double-click opening
- Tests

This phase must be fully functional before advancing.

### Phase 3 — Text Comparison and Editing

- Side-by-side editor
- Diff engine
- Syntax highlighting
- Navigation
- Editing and saving
- Copy change blocks
- Three-way merge

### Phase 4 — Synchronization

- Operation planner
- Dry-run preview
- Copy/update/delete
- Backups
- Operation journal
- Recovery
- Tests

### Phase 5 — Specialized Viewers

- JSON and XML
- CSV and Excel
- Images
- Binary/hex
- PDF and DOCX extracted text

### Phase 6 — Advanced Functionality

- Saved sessions
- Workspaces
- CLI
- Reports
- Context menus
- File monitoring
- Preferences

### Phase 7 — Production Release

- Performance optimization
- Accessibility review
- Automated regression testing
- Windows self-contained build
- Installer/portable distribution
- User documentation
- Release notes

At each phase, keep the application runnable and avoid regressing completed functionality.

---

# 20. ACCEPTANCE CRITERIA

A feature is considered complete only when:

1. It has working application logic.
2. The UI connects to that logic.
3. It handles expected errors.
4. Its critical scenarios have tests.
5. It is documented.
6. It passes the relevant build and test checks.
7. It has no knowingly nonfunctional buttons or placeholder screens.

The application must satisfy at least these end-to-end workflows:

**Workflow A:** User selects two folders, scans them, identifies differences, opens a file comparison, and copies a selected change.

**Workflow B:** User selects two folders, previews a one-way synchronization, confirms the operation, and sees the successful result.

**Workflow C:** User compares two source files, navigates differences, edits a result, and saves without corrupting encoding.

**Workflow D:** User loads three text versions, identifies conflicts, resolves them, and saves a merged document.

**Workflow E:** User compares two JSON files and navigates their semantic differences.

**Workflow F:** User saves a comparison session, closes the application, and later reopens the session.

**Workflow G:** User launches the Windows self-contained executable without manually installing the .NET runtime.

---

# 21. INSTRUCTIONS FOR THE CODING AGENT

Follow this workflow:

1. Inspect the repository and installed development environment.
2. If an existing Python DiffDesk prototype is present, use it as a behavioral reference. Do not automatically preserve Python as the production architecture.
3. Verify framework and library versions.
4. Prepare an architecture document and prioritized implementation checklist.
5. Implement Phase 1 and make it runnable.
6. Implement subsequent phases in priority order.
7. Run builds and automated tests after meaningful changes.
8. Diagnose and fix actual errors rather than bypassing failing tests.
9. Maintain a progress file containing completed work, pending work, blockers, and verification results.
10. Do not report a feature as complete until it works end-to-end.

You are authorized to make reasonable engineering decisions without asking for clarification on routine implementation details.

Do not stop after generating architecture documents or project scaffolding.

Continue implementing usable functionality within the available execution environment and report exactly what has been completed.

Never fabricate tests, build results, screenshots, benchmark figures, or release artifacts.

If a dependency or feature is unavailable, document the limitation and implement the remaining supported features.

If the task cannot fit in one execution session, leave the code in a buildable state with a precise continuation checklist.

---

# 22. FINAL DELIVERABLES

Deliver:

- Complete source code
- Working Avalonia desktop application
- Windows self-contained EXE
- Windows installer when the required packaging tools are available
- Automated test suite
- Configuration files
- Sample comparison files
- Architecture documentation
- User guide
- Build instructions
- Known limitations
- Versioned release notes

The finished product should be practical for developers, system administrators, QA engineers, and users working with large volumes of files.

**Start by inspecting the environment, establishing the project architecture, and implementing the application. Prioritize working comparison functionality over decorative UI.**
