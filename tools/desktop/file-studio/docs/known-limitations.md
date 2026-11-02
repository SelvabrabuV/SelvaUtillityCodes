# Known limitations

These are current limits of the code, not a promise to leave them.

## HTML

CSV keeps one header row. Extra header rows are written as data. Merged cells become a value plus blank covered cells. Nested tables are separate tables; the parent cell does not repeat the nested text.

## JSON and XML

JSON duplicate keys are warnings. The last value wins, which is what `JSON.parse` does. XML entity declarations and external identifiers are rejected. Object conversion between XML and JSON can drop comments. The ordered XML formatter is what keeps comments and CDATA.

Mapping expands one array. Any other array or object in a column is serialized into that cell so two arrays do not create a Cartesian product. Mapping templates are stored in the local settings file. The tree editor rewrites JSON. XML keeps its source editor; converting to JSON is the way to use the tree.

## Images

Animated GIF frames are not preserved. The first frame opens, and that is called out in the UI. BMP can be read. A BMP export request is written as PNG, and the warning says so. JPEG export is lossy; the project file is the non-destructive copy. Brightness, contrast, and saturation stay on the project until preview or export. Crop and resize replace the working pixels. OCR uses the bundled English traineddata. It does not recover the original font. A replacement paints a background and new text over that region only.

## PDF

`pdf-lib` does not edit arbitrary existing text objects. File Studio removes or replaces text only when it can rewrite the page content stream and, for redaction, prove the needle is gone from extracted text and decoded streams. If the page draws an image, redaction is refused. Overlay text is labeled as an overlay.

Password-protected PDFs can be viewed after the user types the password. Page editing still requires an unencrypted file because `pdf-lib` cannot safely rewrite encrypted documents here.

Annotations written by the app are real PDF annotation dictionaries (Square, Circle, Line, Text, Highlight, Underline, StrikeOut, Stamp, Ink). They are not React-only drawings. Place image embeds a new image in the page content. It does not replace an existing image XObject. Existing text is rewritten only when one literal text showing can be replaced; otherwise the overlay path is labeled as an overlay.

The viewer shows a thumbnail strip for the first 40 pages, fit-width, fit-page, and a transparent text layer for selection. Continuous scrolling is limited to documents of 12 pages or fewer. Search still uses extracted text. Page PNG export renders the current page. Recognize page runs English OCR on a rendered picture of the current page. Make searchable writes those words as invisible Helvetica text (PDF text rendering mode 3). It does not recover fonts, and a rotated page can place that layer away from the picture. Words Helvetica cannot encode are skipped. Secure redaction still refuses pages that draw images.

## Recovery and webpages

Autosave writes JSON copies for dirty HTML, JSON, XML, and image projects into the app recovery folder. It does not copy PDFs, and it does not overwrite the file you opened. Copies larger than the recovery cap are skipped. Open webpage downloads one http or https address from the main process. Local and private host names are refused. That check does not resolve DNS, so it does not stop a public name that points at a private address. The fetched HTML is parsed as text. Scripts are not run.

## Packaging

The Windows installer and portable exe are produced by electron-builder and are unsigned.
