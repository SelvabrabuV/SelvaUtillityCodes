# User guide

## Open and save

Ctrl+O opens files. Drag a file onto the home screen to open it from memory. Ctrl+V, or Paste clipboard on the home screen, opens an image, HTML, or JSON from the clipboard as a new tab. Ctrl+S saves the active tab. If the tab has no path yet, or you press Ctrl+Shift+S, you get Save As. Closing a dirty tab asks first.

When autosave is on, dirty HTML, JSON, XML, and image projects are copied about every 20 seconds into the app recovery folder as `.recovery.json`. Home lists those copies. Opening one restores a dirty tab. The file you originally opened is left as it was. PDFs are not copied there.

Export writes a new file. It does not replace the file you opened unless you confirm an overwrite. An overwrite keeps a `.bak` beside the original.

## HTML

Paste HTML or open an `.html` file. Open webpage downloads one address. It tells you that the internet is used, and it does not run scripts. Local and private addresses are refused. Every table is listed. Double-click a grid cell to edit the value that will be exported. Drag a column edge to resize it. Filter hides rows in the grid only; Excel and CSV still export every row. Delete row, delete column, and rename header use the selected cell. Preview export shows row counts before you write Excel or CSV. Hidden cells are dropped unless Settings includes them. Cells that start with `=`, `+`, `-`, or `@` are stored as text so Excel does not treat them as formulas.

## JSON and XML

The source editor and the tree stay apart when the source is invalid: the last good tree remains, and the error is shown. Query uses JSONPath or XPath. JSONPath expressions that contain parentheses or `eval` are rejected. Pick a record path to build rows. One nested array can be expanded. Other arrays stay JSON in a cell. Double-click a mapped cell to write that value back into the JSON. Save template stores the mapping in local settings. Export those rows to Excel or CSV.

## Images

Pen, brush, eraser, text, rectangle, ellipse, and arrow tools add objects on the canvas. Undo and redo walk the canvas snapshots. Brightness, contrast, and saturation stay on the project until you preview or export. Crop and resize replace the working pixels and leave the file you opened untouched. Detect text lists OCR words and confidence. Choosing one asks for replacement text and states that the font is not the original.

Save writes a `.fstudio` project. Export writes a picture.

## PDF

Thumbnails, fit width, fit page, and a text layer sit on the page. Continuous view stacks at most 12 pages. Search jumps to a page. Recognize page reads English text from a picture of the current page. Make searchable writes those words as invisible Helvetica so a later search can find them. That text is not the original font. Highlight, underline, strike, notes, rectangle, circle, arrow, stamp, and ink are annotation objects stored in the PDF. Add text and Place image add new content. They do not claim to rewrite an existing text or image object. Redact asks for a string, explains whether it can be removed, and refuses the action when it cannot prove the removal. Overlay text is a cover, not a change to the original text object. Split to folder writes one PDF per page. Page PNG renders the current page.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open |
| Ctrl+V | Paste clipboard into a new tab |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save as |
| Ctrl+W | Close tab |
| Ctrl+Tab | Next tab |
| Ctrl+Z | Undo the active editor, then the document |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+F | Find in the active module |
| Ctrl+H | Replace where the module has it |
| Ctrl++ / Ctrl+- | Zoom the workspace |
| Ctrl+0 | Actual size |

Ctrl+Z inside Monaco, an input, or the image canvas stays with that editor. Outside those, it restores the previous document snapshot.
