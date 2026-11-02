# Technical decisions

- Electron with a sandboxed renderer, not a browser wrapper that calls Node from the page.
- One tool folder, `tools/desktop/file-studio`, on branch `feature/file-studio`.
- `pdf-lib` plus `pdf.js` instead of an AGPL engine such as MuPDF.
- Sharp for pixels. It is a native module, so packaging runs `electron-builder install-app-deps` before a Windows build. Unit tests use the Node build of Sharp.
- English OCR data ships as the `@tesseract.js-data/eng` dependency so the installed app does not download it.
- Only `.fstudio` is registered as a file association. Taking over `.pdf` or `.html` would replace the user's default apps.
- Formula-looking strings are escaped on export. Numbers and dates are still written as those Excel types when every value in the column agrees.
