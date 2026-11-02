# MASTER DEVELOPMENT PROMPT — FILE STUDIO

## 1. Your Role

You are a Principal Software Architect, Senior Full-Stack Engineer, Desktop Application Engineer, UX Designer, and QA Automation Engineer.

Build a complete, production-quality **Windows desktop application named File Studio**.

File Studio is an offline-first utility that combines:

1. HTML Table to Excel / CSV Converter
2. XML and JSON Parser, Viewer, Editor, and Converter
3. Native Image Editor
4. PDF Viewer and Editor

**This is an implementation assignment, not a design or feasibility exercise.**

You must create the complete application, not merely generate a technical plan, UI mockup, or partial prototype.

Work autonomously within the existing repository. Make reasonable architectural decisions without repeatedly requesting clarification. Inspect the existing codebase before starting and reuse working infrastructure.

Do not claim a feature is complete unless its implementation and tests demonstrate that it works.

---

## 2. Product Objectives

Create a professional utility comparable in usability to dedicated desktop file tools.

The application must:

- Run on Windows 10 and Windows 11.
- Work offline after installation.
- Require no user account, API key, or external cloud service.
- Have a clean, modern desktop interface.
- Open and edit multiple files simultaneously.
- Support drag-and-drop, clipboard input, and native file dialogs.
- Preserve the user's original files unless explicitly overwritten.
- Provide previews before conversion or export.
- Handle large files without freezing the UI.
- Support keyboard shortcuts, undo/redo, and error recovery.
- Support both light and dark themes.
- Save user preferences locally.
- Provide a packaged Windows installer and portable executable where practical.

The application should behave like a real desktop program, not a website wrapped in Electron with nonfunctional controls.

---

## 3. Technology Architecture

### Recommended Stack

- Electron for the Windows desktop shell.
- React with TypeScript for the frontend.
- Vite for development and bundling.
- Tailwind CSS and shadcn/ui for UI components.
- Zustand for application and workspace state.
- Monaco Editor for JSON, XML, and HTML source editing.
- TanStack Table with row virtualization for structured data.
- Cheerio for HTML parsing.
- ExcelJS for Excel generation and manipulation.
- Papa Parse for CSV import/export.
- fast-xml-parser for XML parsing.
- JSONPath/XPath libraries with safe evaluation.
- Fabric.js for interactive image editing.
- Sharp for image processing, format conversion, and metadata.
- PDF.js for PDF viewing and text extraction.
- pdf-lib for supported PDF modifications.
- A separate advanced PDF editing engine where required.
- Tesseract.js or a packaged local OCR engine for OCR workflows.
- Vitest for unit and integration tests.
- Playwright/Electron automation for end-to-end tests.
- electron-builder for Windows packaging.

Use stable, maintained library versions compatible with one another. Verify current APIs, licenses, and compatibility before implementation.

Do not introduce a Python runtime, local HTTP server, database, or additional native dependency unless it solves a specific requirement that the selected stack cannot handle reliably.

### Architecture Requirements

Separate the application into:

1. Desktop shell and IPC
2. File management service
3. Shared data conversion engine
4. HTML processing module
5. XML/JSON processing module
6. Image processing and editing module
7. PDF processing and editing module
8. Background job manager
9. Local settings and recovery service
10. Shared UI component library

Every major conversion operation should be independently callable and testable without launching the desktop UI.

All filesystem operations must use controlled Electron IPC APIs.

Apply Electron security recommendations:

- Context isolation enabled
- Renderer sandboxing enabled
- Node integration disabled in the renderer
- Typed, minimal preload interface
- Validated IPC payloads and senders
- Restrictive content security policy
- No arbitrary renderer command execution
- Safe handling of untrusted files

---

# 4. GLOBAL USER INTERFACE

## Desktop Layout

Create a polished interface with:

### Left Navigation

- Home
- HTML Converter
- XML / JSON Workspace
- Image Editor
- PDF Editor
- Batch Conversion
- Recent Files
- Settings

### Top Toolbar

- New
- Open File
- Open Folder
- Save
- Save As
- Undo
- Redo
- Export
- Search
- Theme Toggle

### Main Workspace

Support:

- Multiple document tabs
- Closable and reorderable tabs
- Split editor and preview panes
- Resizable side panels
- Zoom controls
- File metadata
- Contextual toolbars
- Keyboard shortcuts
- Drag-and-drop

### Status Bar

Display:

- Current filename
- File type
- File size
- Validation state
- Cursor/selection details
- Processing progress
- Unsaved changes indicator

Provide professional empty states, loading states, failure messages, and success notifications.

Never leave a blank interface when file parsing fails.

## Home Screen

The home screen should show four prominent application modules and recent files.

Also support dragging a file onto the home screen and automatically opening the corresponding editor.

The interface must not look like a generic administrative dashboard. It should look like a focused document and file editing application.

---

# 5. MODULE 1 — HTML TABLE TO EXCEL / CSV

## Input

Support:

- HTML files
- HTM files
- Pasted HTML source
- Pasted HTML tables
- HTML clipboard content
- HTML snippets containing multiple tables

Optionally support converting table content from a user-supplied webpage URL, provided this feature is explicitly invoked and clearly identified as requiring internet access.

## HTML Parsing

Automatically identify all tables in an HTML document.

Support:

- Multiple tables
- Nested tables
- Table headers
- `thead`, `tbody`, `tfoot`
- `th`, `td`
- `rowspan`
- `colspan`
- Empty cells
- Embedded line breaks
- HTML entities
- Unicode content
- Inline formatting
- Table captions
- Hidden cells, with configurable handling
- HTML attributes
- Irregular rows

Parse the HTML using a proper HTML parser.

Do not use regex as the primary HTML parsing mechanism.

Never execute scripts from imported HTML.

## Table Selection

Show all detected tables in a navigator.

For every table, display:

- Table number
- Caption or generated name
- Row count
- Column count
- Preview

Allow the user to select individual tables or all tables.

## Table Editor

Provide an Excel-like grid with:

- Editable cells
- Row selection
- Column selection
- Copy/paste
- Sorting
- Filtering
- Column resizing
- Find and replace
- Delete rows
- Delete columns
- Rename columns
- Header-row selection
- Data type detection
- Blank-row handling

Changes made in the grid should affect the exported content.

## Excel Export

Export to XLSX.

Support:

- Individual selected tables
- Multiple tables as separate worksheets
- Combined tables when schemas are compatible
- Worksheet naming
- Column widths
- Data types
- Date formatting
- Merged cells derived from HTML row/column spans
- Header styling
- Freeze header row
- Auto-filter

Preserve applicable HTML table formatting where feasible, without promising pixel-perfect reproduction.

## CSV Export

Support:

- UTF-8
- UTF-8 with BOM
- Configurable delimiter
- Comma, semicolon, and tab
- Optional headers
- Quote escaping
- Newline configuration
- One CSV per table
- Multiple CSV files exported into a user-selected folder

CSV cannot preserve merged cells or visual styling. Normalize the table explicitly.

## Acceptance Criteria

Import an HTML document containing five separate tables with merged headers.

Verify that:

1. All five tables are detected.
2. Every table can be previewed.
3. The user can edit values.
4. Each table exports to its own Excel sheet.
5. Selected tables export correctly to CSV.
6. Data survives an Excel/CSV read-back test.
7. The source HTML is not unexpectedly modified.

---

# 6. MODULE 2 — XML AND JSON WORKSPACE

This is a full structured-data editor, not just a syntax formatter.

## Supported Inputs

- XML
- JSON
- JSONL / NDJSON where appropriate
- Pasted structured text
- Files opened from Windows Explorer
- Clipboard content

Automatically detect supported formats when possible.

## Workspace Views

Provide four synchronized views:

### A. Source Editor

Use Monaco Editor.

Support:

- Syntax highlighting
- Auto-indentation
- Line numbers
- Bracket matching
- Code folding
- Search and replace
- Minification
- Beautification
- Validation
- Error highlighting
- Go to line
- Configurable indentation
- Word wrap
- Large-file warning/fallback

### B. Tree Viewer

Display hierarchical data as expandable nodes.

Support:

- Expand/collapse
- Expand all/collapse all with safety limits
- Copy node
- Copy value
- Copy path
- Add child
- Edit value
- Delete node
- Rename property/key
- Search tree
- Node counts
- Data type indicators

Lazy-render large structures.

### C. Table Viewer

Detect repeated objects or XML elements that can form a table.

Support:

- Column selection
- Sorting
- Filtering
- Pagination or virtualization
- Nested-property flattening
- Column renaming
- Record path selection
- Editable scalar cells
- Excel/CSV export

### D. Conversion Preview

Show the output representation before exporting.

Support XML to JSON, JSON to XML, and structured data to Excel/CSV.

## JSON Features

Implement:

- Strict JSON validation
- Helpful syntax errors with line and column
- Pretty print
- Minify
- Search by property/value
- JSONPath query
- Array inspection
- Nested object editing
- Scalar type preservation
- Duplicate-key detection with warnings
- Copy JSON paths
- JSON-to-JSONL where appropriate

JSONPath behavior must follow the selected library's documented syntax.

## XML Features

Implement:

- XML validation
- Pretty print
- Minify
- XPath search
- Namespace-aware tree display
- Attribute editing
- Element editing
- Text content editing
- XML declaration handling
- CDATA handling
- Comment handling
- Processing instruction handling
- Line-aware errors where available

Preserve XML namespaces and ordering where required.

Source round-tripping must not silently discard comments, CDATA distinctions, or other XML constructs. If a chosen parser cannot retain them, use a separate lossless document model or source-preserving editing mechanism.

Disable external entity resolution and DTD-based external resource access by default to prevent XXE-related vulnerabilities.

## XML ↔ JSON Conversion

Provide configurable conversion options:

- XML attributes to object properties
- Text nodes to configured keys
- Repeated elements to arrays
- Empty elements
- Namespace treatment
- Preserve or normalize element names
- Formatting options

Explain that XML and JSON have different data models and that conversion may not be perfectly reversible.

Show conversion warnings when information may be lost.

## JSON/XML to Excel/CSV

This is an important capability.

Do not simply serialize the entire JSON/XML document into one spreadsheet cell.

Implement a structured mapping engine.

Example JSON:

```json
{
  "orders": [
    {
      "id": "O001",
      "customer": "John",
      "items": [
        {"product": "Laptop", "quantity": 1},
        {"product": "Mouse", "quantity": 2}
      ]
    }
  ]
}
```

The user should be able to choose:

- One row per order
- One row per item
- Flatten nested properties
- Expand array records
- Serialize selected arrays into cells
- Exclude fields
- Rename fields
- Select nested record paths

Example item-level result:

| Order ID | Customer | Product | Quantity |
|---|---|---|---|
| O001 | John | Laptop | 1 |
| O001 | John | Mouse | 2 |

Do not create unintended Cartesian products when multiple arrays exist.

Provide explicit array-expansion policies.

## Data Mapping UI

Create a visual mapping interface with:

- Source path
- Output column
- Output data type
- Default value
- Include/exclude toggle
- Transformation preview

Support saving reusable mapping templates locally.

## Acceptance Criteria

Test:

1. Simple JSON object
2. Nested JSON
3. Arrays of objects
4. Multiple nested arrays
5. XML with attributes
6. XML with namespaces
7. XML with repeated elements
8. Malformed XML
9. Malformed JSON
10. Large structured files

Edits in source/tree/table views must follow a defined synchronization model and cannot silently overwrite one another.

The Excel/CSV output must be tested against the expected row and column data.

---

# 7. MODULE 3 — NATIVE IMAGE EDITOR

Build an interactive desktop image editor.

The user should be able to open an image, edit it, and save it in the same supported image format.

Also provide a separate editable project format so layers and editing state can be retained.

## Image Formats

Prioritize:

- PNG
- JPEG
- WebP
- BMP
- TIFF

Support GIF opening and basic export where the selected processing engine permits it.

Animated GIF editing is a separate capability and must not be represented as supported unless frame-preserving behavior is implemented and tested.

## Editing Workspace

Provide:

- Central canvas
- Zoom controls
- Pan controls
- Toolbar
- Layers panel
- Properties panel
- Image metadata
- History panel
- Export dialog

## Basic Editing

Implement:

- Crop
- Resize
- Rotate
- Flip horizontally/vertically
- Brightness
- Contrast
- Saturation
- Sharpness
- Blur
- Grayscale
- Color adjustment
- Opacity
- Background color
- Transparent background where supported
- Image format conversion

## Drawing and Annotation

Implement:

- Pen
- Brush
- Eraser
- Rectangle
- Ellipse
- Line
- Arrow
- Text box
- Text formatting
- Color picker
- Stroke thickness
- Object selection
- Multi-object selection
- Align/distribute
- Move forward/backward
- Duplicate
- Delete
- Undo/redo

## Text Editing

Support adding editable text layers.

Allow:

- Font family selection
- Font size
- Bold/italic
- Text color
- Text alignment
- Rotation
- Spacing
- Position
- Opacity

### Editing Existing Text in Raster Images

Implement an optional OCR-assisted workflow:

1. Detect text in an image using local OCR.
2. Display detected text regions.
3. Allow the user to select a region.
4. Allow text replacement.
5. Offer font suggestions where feasible.
6. Allow manual font/size/color matching.
7. Reconstruct the affected image background using a suitable approach.
8. Render the replacement text.
9. Preview the result before applying.

Important engineering requirement:

Raster images usually do not retain original editable font metadata. Do not claim that the exact original font can always be recovered.

Show an estimated or manually selected font, with user-adjustable controls.

Original pixels outside edited regions should remain unchanged wherever technically possible.

## Layer System

Support:

- Image layer
- Text layer
- Shape layer
- Annotation layer
- Layer visibility
- Layer ordering
- Layer locking
- Layer naming

## Native Format Saving

Examples:

PNG → Edit → PNG

JPEG → Edit → JPEG

WebP → Edit → WebP

Preserve dimensions, color profile, EXIF orientation, and supported metadata where feasible and selected.

Show warnings when the output format cannot retain transparency, layers, animation, or metadata.

For JPEG, repeated saving may introduce generation loss. Implement non-destructive project editing and avoid repeatedly recompressing the original during editing.

## Editable Project Format

Define a documented project format such as `.fstudio`.

It should preserve:

- Original image reference or embedded source
- Canvas dimensions
- Layers
- Text objects
- Transformations
- Filters
- History state where practical
- Export preferences

Reopening the project must restore editable objects.

## Acceptance Criteria

Open a PNG, add a text layer and arrow, crop it, save as PNG, and reopen it.

Also verify:

- The editable project retains all layers.
- Exported JPEG/WebP files open in external viewers.
- Undo and redo work.
- No unexpected changes occur to the original file.
- OCR-assisted editing clearly distinguishes detected text from confirmed font identity.

---

# 8. MODULE 4 — PDF EDITOR

Build a comprehensive PDF workspace.

PDF editing is more technically complex than basic PDF page manipulation. Design the PDF engine carefully.

## PDF Viewer

Implement:

- Open PDF
- Page navigation
- Thumbnail sidebar
- Zoom
- Fit to page
- Fit to width
- Continuous scrolling
- Page rotation
- Search text
- Text selection
- Copy text
- Document metadata
- Password-protected PDF opening when authorized

## Page Management

Support:

- Add blank page
- Delete page
- Duplicate page
- Rotate page
- Reorder pages
- Extract selected pages
- Merge PDFs
- Split PDF
- Combine selected documents
- Export page ranges
- Save modified document

Use drag-and-drop for page rearrangement.

## PDF Annotation

Support:

- Highlight
- Underline
- Strike-through
- Sticky notes
- Freehand drawing
- Text annotations
- Rectangles
- Circles
- Arrows
- Image placement
- Signature image placement
- Stamps
- Annotation deletion

Use proper PDF annotation objects where appropriate.

Do not merely display annotations in React if they disappear after saving.

## PDF Text Editing

Support two distinct modes.

### A. Add New Text

Allow the user to:

- Insert text
- Select font
- Change size/color
- Position text
- Rotate text
- Adjust alignment
- Save it into the PDF

### B. Edit Existing PDF Text

Investigate and integrate an engine capable of modifying existing PDF text objects where feasible.

Possible options include evaluating PDFium editing APIs or an appropriately licensed advanced PDF SDK.

Do not assume pdf-lib alone can reliably modify existing arbitrary PDF text.

Implement text-object selection, inspection, and supported editing operations.

Some PDFs contain embedded/subset fonts, fragmented text, custom encodings, transformed glyphs, or outlines.

When exact object-level editing is not supported:

- Explain the limitation.
- Offer a clearly labeled visual replacement workflow.
- Preserve the untouched source document.
- Show whether the edited text is a new overlay or genuine content replacement.
- Do not falsely claim that the original text object has been modified.

Research and document licensing obligations for any advanced PDF engine.

Do not silently introduce AGPL-licensed components into a closed-source-distribution build without an appropriate licensing decision.

## PDF Images

Support:

- Insert image
- Position image
- Resize image
- Rotate image
- Remove supported image objects
- Replace supported image objects where the engine permits

For unsupported embedded objects, explain the limitation.

## Forms

Support:

- Detect PDF form fields
- Fill text fields
- Check checkboxes
- Select radio buttons
- Select dropdown values
- Save form values

Support flattening forms where the selected engine provides reliable functionality.

## OCR

Support scanned PDFs using local OCR.

Enable:

- Page image rendering
- OCR execution
- Text recognition preview
- Copy recognized text
- Searchable PDF generation when supported

Make OCR optional and keep all processing local.

## Redaction

This feature must be genuinely secure.

A black rectangle overlay is not sufficient redaction.

Implement redaction only through a method that removes the underlying sensitive content from the output PDF, including the relevant text/image content where applicable.

If secure removal cannot be guaranteed for a document, disable the final redaction action and explain why.

Test that redacted data cannot be recovered through text extraction or ordinary PDF object inspection.

## Export

Support:

- Save PDF
- Save As PDF
- Extract pages
- Convert selected PDF pages to PNG/JPEG
- Export extracted text
- Generate searchable PDF from scans where possible

## PDF Acceptance Criteria

Test at least:

1. Native text PDF
2. Scanned PDF
3. Multipage PDF
4. PDF with forms
5. PDF with annotations
6. PDF with embedded images
7. Password-protected PDF with authorized credentials
8. PDF containing rotated pages
9. PDFs with unusual or subset fonts

Verify that saved output opens correctly in independent PDF viewers.

---

# 9. SHARED CONVERSION ENGINE

Create reusable conversion infrastructure.

Define clear interfaces resembling:

```typescript
interface Converter<Input, Output> {
  validate(input: Input): Promise<ValidationResult>;
  preview(input: Input, options: ConversionOptions): Promise<PreviewResult>;
  convert(input: Input, options: ConversionOptions): Promise<Output>;
}
```

Implement:

- Input validation
- Conversion options
- Output generation
- Cancellation
- Progress reporting
- Structured errors
- Logging
- Result metadata

Use separate adapters for each format.

Never embed business logic directly inside React button handlers.

---

# 10. BATCH PROCESSING

Create a Batch Conversion workspace.

Support:

- Add multiple files
- Add folders
- Remove files
- Choose destination
- Configure common export options
- Start processing
- Pause queued work
- Cancel
- Retry failures
- View completed files
- Open destination folder

Examples:

- 20 HTML files → Excel
- 50 JSON files → CSV
- 100 PNG images → WebP
- Multiple PDFs → merged PDF

Add collision-handling options:

- Rename output
- Overwrite with confirmation
- Skip existing
- Create numbered versions

Show progress for each file and the overall batch.

Do not load all large files into memory simultaneously.

---

# 11. FILE MANAGEMENT

Implement:

- Open File
- Open Multiple Files
- Open Folder
- Save
- Save As
- Export
- Recent Files
- Reopen Recent
- Show in Explorer
- Drag-and-drop
- Clipboard paste
- File type detection

Auto-detect a file's format using extension and, where necessary, file-content inspection.

Warn users about extension/content mismatches.

Maintain document dirty-state tracking.

Show a confirmation before closing a document with unsaved changes.

Use atomic writes and backups where appropriate to reduce the chance of corrupting files.

Support autosave of editable application projects to a recovery location without silently overwriting original imported files.

---

# 12. PERFORMANCE REQUIREMENTS

Design for large files.

Targets for representative testing:

- HTML containing 100,000 table rows
- JSON of approximately 50 MB
- XML of approximately 50 MB
- Large images up to practical device memory limits
- PDF containing hundreds of pages

These are engineering test targets, not guarantees that every arbitrary file can be handled within fixed memory limits.

Use:

- Virtual scrolling
- Lazy rendering
- Background worker processes
- Streaming parsing where practical
- Incremental conversion
- Bounded concurrency
- Memory-conscious data models
- Debounced validation
- Cancellation support

Never block the main Electron process with heavy parsing, image manipulation, or PDF operations.

Provide an explicit fallback when Monaco or the tree viewer cannot safely load a very large document.

---

# 13. SECURITY REQUIREMENTS

Treat all imported files as untrusted.

Implement safeguards for:

- Malicious HTML
- JavaScript embedded in imported HTML
- XML entity attacks
- External entity access
- Excessive nesting
- Decompression bombs
- Oversized images
- Malformed PDFs
- Path traversal
- Unsafe filenames
- Spreadsheet formula injection
- Excessive memory consumption
- Unsafe archive contents if archives are supported

Prevent CSV/Excel exports from unexpectedly interpreting user-supplied strings as executable formulas. Provide safe default escaping while allowing intentional data typing through explicit user choices.

Do not execute arbitrary input as code.

Do not upload or transmit document contents.

Any diagnostic logging must avoid recording sensitive document contents by default.

---

# 14. KEYBOARD SHORTCUTS

Implement:

| Shortcut | Behavior |
|---|---|
| Ctrl+O | Open file |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+F | Find |
| Ctrl+H | Replace where supported |
| Ctrl+C | Copy |
| Ctrl+V | Paste |
| Ctrl+A | Select all in active editor |
| Ctrl+W | Close active tab |
| Ctrl+Tab | Next tab |
| Ctrl++ | Zoom in |
| Ctrl+- | Zoom out |

Use context-aware shortcuts to avoid triggering unintended actions while an input or editor is focused.

---

# 15. SETTINGS

Provide local settings for:

- Light/dark/system theme
- Default export folder
- Recent files limit
- Default CSV delimiter
- CSV encoding
- Excel header styling
- JSON formatting
- XML formatting
- Large-file behavior
- Image export quality
- Image default format
- PDF view preferences
- Autosave/recovery
- Default zoom
- UI density

Settings should persist between application launches.

Do not require a server or database for basic settings.

---

# 16. EXPECTED PROJECT STRUCTURE

Use a modular structure similar to:

```text
file-studio/
  src/
    main/
      index.ts
      windows/
      ipc/
      services/
      workers/

    preload/
      index.ts
      api.ts

    renderer/
      app/
      components/
      layouts/
      pages/
        home/
        html/
        structured-data/
        image/
        pdf/
        batch/
        settings/
      hooks/
      stores/
      styles/

    core/
      contracts/
      conversion/
      html/
      json/
      xml/
      spreadsheet/
      csv/
      image/
      pdf/
      validation/
      errors/

    shared/
      types/
      schemas/
      constants/
      utils/

  tests/
    unit/
    integration/
    e2e/
    fixtures/

  resources/
    icons/
    fonts/
    ocr/

  docs/
    architecture.md
    feature-matrix.md
    user-guide.md
    technical-decisions.md
    known-limitations.md
    licensing.md

  scripts/
  build/
  package.json
  tsconfig.json
  README.md
```

You may improve the organization, but retain a clean separation between rendering, domain logic, file services, and background processing.

---

# 17. TESTING REQUIREMENTS

Do not deliver untested functionality.

Implement:

### Unit Tests

Test parsing, formatting, validation, data mapping, and conversion.

### Integration Tests

Test actual file input/output operations, including reopen/read-back verification.

### End-to-End Tests

Automate real user interactions inside the Electron application:

- Launch application
- Open file
- Preview file
- Edit content
- Save
- Export
- Reopen exported result
- Confirm expected output

### Regression Tests

Cover:

- Empty files
- Invalid files
- Missing permissions
- Read-only files
- Unicode
- Long filenames
- Large files
- Cancelled operations
- Interrupted exports
- Nested structures
- Different image formats
- Different PDF types

### Quality Gates

Run and pass:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Add a dedicated E2E command.

If a test fails, investigate and fix it rather than removing the test.

---

# 18. WINDOWS PACKAGING

Produce a Windows desktop release.

Requirements:

- Installer-based release
- Portable build where feasible
- Application icon
- Start menu shortcut
- Desktop shortcut as an installer option
- Correct application name
- Native file dialogs
- Windows Explorer file associations where appropriate
- Uninstaller
- Bundled runtime dependencies
- No mandatory internet dependency

Use electron-builder or a comparably maintained packaging tool.

If running in a non-Windows development environment, perform supported packaging checks and clearly document which Windows-specific tests require Windows execution.

Document requirements for code signing and Windows SmartScreen reputation.

Do not claim the installer is signed if no signing certificate exists.

---

# 19. IMPLEMENTATION WORKFLOW

Follow this sequence.

### Step 1 — Repository Inspection

Inspect the current project.

Identify existing code, build configuration, dependencies, and tests.

Preserve useful implementations.

### Step 2 — Architecture

Write a concise implementation architecture and capability matrix.

For every requested feature, identify the responsible module, selected library, and verification strategy.

### Step 3 — Foundation

Implement:

- Electron startup
- React UI
- Secure preload bridge
- Navigation
- Tabs
- Settings
- File services
- Error handling
- Background job manager

### Step 4 — HTML Module

Implement and test the complete HTML table workflow.

### Step 5 — XML / JSON Module

Implement and test the source editor, tree viewer, table viewer, editing, and conversion workflows.

### Step 6 — Image Module

Implement and test the image editor, project persistence, raster export, and OCR-assisted text editing.

### Step 7 — PDF Module

Implement and test viewing, annotations, pages, forms, text editing modes, OCR, and supported secure redaction.

### Step 8 — Batch Processing

Implement conversion queues and progress tracking.

### Step 9 — Integration

Make all modules work within the same desktop application.

### Step 10 — Hardening

Perform security, performance, recovery, and error-handling tests.

### Step 11 — Packaging

Build the Windows distributable.

### Step 12 — Verification

Run the application and execute the test suite.

Repeat until all achievable acceptance criteria pass.

---

# 20. AUTONOMOUS AGENT EXECUTION RULES

These instructions are mandatory.

1. Do not stop after generating a project skeleton.
2. Do not substitute static UI mockups for functional editors.
3. Do not implement buttons that do nothing.
4. Do not mark a feature complete based solely on rendering its screen.
5. Do not write placeholder conversion functions that return fake results.
6. Do not use mock data for real user conversion operations.
7. Do not silently omit difficult requirements.
8. Do not silently change the requested technology stack without documenting the reason.
9. Do not introduce paid services without explicit authorization.
10. Do not add mandatory AI APIs.
11. Do not upload local files to cloud services.
12. Do not overwrite source files without explicit user confirmation.
13. Do not make security compromises to bypass Electron IPC restrictions.
14. Do not describe visual PDF overlays as genuine text-object replacement.
15. Do not claim exact image-font recovery from raster pixels.
16. Do not claim secure PDF redaction unless underlying data removal is verified.
17. Do not introduce incompatible licenses without documenting and resolving their obligations.
18. Do not skip tests to accelerate delivery.
19. Do not give a completion report that contradicts actual build or test results.
20. Do not declare the project finished while important requested features are unimplemented without explicitly identifying them.

When encountering a blocker:

- Diagnose its cause.
- Research documented APIs or alternatives.
- Implement a tested solution where feasible.
- Record the trade-off.
- Continue with other independent work.
- Clearly identify any remaining blocker.

If the execution environment imposes limits, preserve progress through source commits and an updated implementation plan. Do not falsely state that unexecuted tasks were completed.

---

# 21. DOCUMENTATION

Generate:

- README.md
- Installation instructions
- Development setup
- Architecture documentation
- Module descriptions
- Keyboard shortcut guide
- End-user documentation
- Troubleshooting guide
- Testing instructions
- Dependency/license inventory
- Supported-format matrix
- Known limitations

Document the exact output behavior for Excel, CSV, XML, JSON, images, and PDF.

---

# 22. FINAL ACCEPTANCE CHECKLIST

The application is only ready for release when the following are verified:

### Desktop

- [ ] Application launches
- [ ] Navigation works
- [ ] Files can be opened
- [ ] Multiple tabs work
- [ ] Save and Save As work
- [ ] Unsaved changes are protected
- [ ] Settings persist
- [ ] Installer can be produced

### HTML

- [ ] Detect HTML tables
- [ ] Preview individual tables
- [ ] Edit table values
- [ ] Preserve applicable merged-cell structure
- [ ] Export Excel
- [ ] Export CSV
- [ ] Validate exported data

### JSON / XML

- [ ] Parse JSON
- [ ] Parse XML
- [ ] Display tree
- [ ] Edit source
- [ ] Edit structured nodes
- [ ] Validate source
- [ ] Search data
- [ ] Execute path queries
- [ ] Convert XML to JSON
- [ ] Convert JSON to XML
- [ ] Export Excel
- [ ] Export CSV
- [ ] Handle nested arrays correctly

### Images

- [ ] Open image
- [ ] Crop, resize, rotate
- [ ] Draw shapes
- [ ] Add text
- [ ] Edit layers
- [ ] Apply adjustments
- [ ] Undo/redo
- [ ] Export to original supported format
- [ ] Reopen editable project
- [ ] OCR-assisted text workflow

### PDF

- [ ] Open and view PDF
- [ ] Search and navigate
- [ ] Add annotations
- [ ] Add text
- [ ] Manage pages
- [ ] Merge and split
- [ ] Fill supported forms
- [ ] Export images
- [ ] Save modified PDF
- [ ] OCR scanned pages
- [ ] Verify supported existing-text editing behavior
- [ ] Verify secure redaction where supported

### Quality

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Production build succeeds
- [ ] No unexplained critical runtime errors
- [ ] No known silent data-loss defects
- [ ] Security-sensitive functionality has been reviewed

---

# 23. FINAL DELIVERY

At the end, provide:

1. Complete source code in the repository.
2. Runnable application.
3. Packaged Windows build if the environment supports producing it.
4. Installation and execution instructions.
5. Architecture summary.
6. Implemented feature matrix.
7. Test results and commands executed.
8. Remaining limitations, if any.
9. Relevant licensing obligations.
10. Actual artifact locations.

Do not report success unless the resulting application has been built and verified.

**Begin implementation now. Inspect the repository, establish the architecture, and proceed through working, tested modules until the complete application is delivered.**
