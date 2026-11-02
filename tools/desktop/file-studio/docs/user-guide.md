# User guide

## Open and save

Ctrl+O opens files. Drag a file onto the home screen to open it from memory. Ctrl+S saves the active tab. If the tab has no path yet, or you press Ctrl+Shift+S, you get Save As. Closing a dirty tab asks first.

Export writes a new file. It does not replace the file you opened unless you confirm an overwrite. An overwrite keeps a `.bak` beside the original.

## HTML

Paste HTML or open an `.html` file. Every table is listed. Double-click a grid cell to edit the value that will be exported. Preview export shows row counts before you write Excel or CSV. Hidden cells are dropped unless Settings includes them. Cells that start with `=`, `+`, `-`, or `@` are stored as text so Excel does not treat them as formulas.

## JSON and XML

The source editor and the tree stay apart when the source is invalid: the last good tree remains, and the error is shown. Query uses JSONPath or XPath. JSONPath expressions that contain parentheses or `eval` are rejected. Pick a record path to build rows. Export those rows to Excel.

## Images

Text, rectangle, and arrow tools add objects on the canvas. Undo restores the previous canvas snapshot. Rotate, flip, grayscale, and export run on a working copy. Detect text lists OCR words and confidence. Choosing one asks for replacement text and states that the font is not the original.

Save writes a `.fstudio` project. Export writes a picture.

## PDF

The page canvas is the viewer. Search jumps to a page. Add text, highlight, and notes are written into the PDF bytes. Redact asks for a string, explains whether it can be removed, and refuses the action when it cannot prove the removal. Overlay text is a cover, not a change to the original text object.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save as |
| Ctrl+W | Close tab |
| Ctrl+Tab | Next tab |
| Ctrl+F / Ctrl+H | Left to the focused field or Monaco |

Ctrl+Z inside Monaco is the editor's own undo. On the image canvas, use the Undo button.
