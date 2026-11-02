# Known limitations

These are limits of this build.

## Folders

Reparse points, junctions, and symbolic links are listed and skipped unless you turn on following. Following stays inside the selected folder and stops on a loop. A name collision that only appears when case is ignored is reported as an error. Windows usually cannot create those two names in one folder.

The file watcher marks a result stale. It is not itself a comparison.

## Text and merge

The diff is not recomputed on each keystroke. After an edit or a hunk copy, compare again before the next hunk. Conflict markers are written only when you save a merge that still has conflicts, and the window asks first. The command line refuses that write unless you pass `--force`, and it still exits with code 3.

## Sync

Dry-run is the default. A mirror delete needs confirmation. A folder that still contains files is not deleted. Two-way sync does not treat the newer file as the right one. Undo uses the journal from the last run in that window.

## Other formats

JSON object key order is ignored. Duplicate object keys keep the last value. Duplicate array keys are reported and not paired. XML external entities are rejected.

CSV and XLSX compare cell text. Formulas and macros are not executed. A formula is visible as text when the workbook has no cached value.

Images use Windows GDI+. WebP works only when Windows can decode it. GIF uses the first frame. Different sizes are not resized. Pixel comparison stops above 40 megapixels. ImageSharp is not used.

Binary compare lists up to 5000 differing regions and can show a 4096-byte hex window. It does not edit bytes.

PDF and DOCX comparison uses extracted text. It is not a visual diff. Scanned pages with no text stay empty. OCR is not available.

## Packaging

The published build is a self-contained folder, not an installer. The executable is not signed. Publishing needs about 1500 MB free on the destination drive. The Explorer commands are an optional script and are not installed by the app.
