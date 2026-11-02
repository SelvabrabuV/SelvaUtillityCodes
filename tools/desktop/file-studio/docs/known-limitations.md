# Known limitations

These are current limits of the code, not a promise to leave them.

## HTML

CSV keeps one header row. Extra header rows are written as data. Merged cells become a value plus blank covered cells. Nested tables are separate tables; the parent cell does not repeat the nested text.

## JSON and XML

JSON duplicate keys are warnings. The last value wins, which is what `JSON.parse` does. XML entity declarations and external identifiers are rejected. Object conversion between XML and JSON can drop comments. The ordered XML formatter is what keeps comments and CDATA.

Mapping expands one array. Any other array or object in a column is serialized into that cell so two arrays do not create a Cartesian product.

## Images

Animated GIF frames are not preserved. The first frame opens, and that is called out in the UI. BMP can be read. Export formats exercised in tests are PNG and WebP. JPEG export is lossy; the project file is the non-destructive copy. OCR uses the bundled English traineddata. It does not recover the original font. A replacement paints a background and new text over that region only.

## PDF

`pdf-lib` does not edit arbitrary existing text objects. File Studio removes or replaces text only when it can rewrite the page content stream and, for redaction, prove the needle is gone from extracted text and decoded streams. If the page draws an image, redaction is refused. Overlay text is labeled as an overlay.

Password-protected PDFs can be viewed after the user types the password. Page editing still requires an unencrypted file because `pdf-lib` cannot safely rewrite encrypted documents here.

Annotations written by the app are real PDF annotation dictionaries (Square, Text, Highlight, Ink). They are not React-only drawings.

The viewer draws one page at a time, with previous, next, and zoom. Thumbnails, continuous scroll, fit-page, and a selectable text layer are not in the window yet. Search uses extracted text. The page canvas is a preview of the file bytes.

## Packaging

The Windows installer and portable exe are produced by electron-builder and are unsigned.
