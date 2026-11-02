# Architecture

File Studio is an Electron app. The renderer has no Node integration. Context isolation and the sandbox are on. Files move through a typed preload API.

| Piece | Role |
| --- | --- |
| `src/core` | Parsing, conversion, image operations, PDF operations. Tested without the UI. |
| `src/main` | Window, menus, dialogs, atomic writes, settings, job worker. |
| `src/main/workers/conversion-worker.ts` | Sharp, Tesseract, PDF, and Excel work off the main thread. |
| `src/preload` | The only bridge the renderer can call. |
| `src/renderer` | Tabs, editors, and previews. |

A path can be read or written only after a dialog, a recent file that was opened that way, or a drop that the UI reads with the File API. Export paths must stay inside a folder the user picked. Writes go to a temporary file and then replace the destination. Overwriting an opened original also copies a `.bak` file.

HTML, JSON, and XML editing runs in the renderer because those libraries are pure JavaScript. Image pixels and PDF mutations go through `job:run` so Sharp and PDF work do not block the Electron main process.

Original files are not modified by export. Save over an existing path asks first.
