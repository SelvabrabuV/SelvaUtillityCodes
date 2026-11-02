# Feature matrix

| Area | What works | How it is checked |
| --- | --- | --- |
| HTML tables | Multiple tables, spans, captions, entities, hidden cells, script stripped, row filter | `tests/unit/html-excel.test.ts` |
| Excel / CSV | Sheet per table, merges, formula text, CSV round-trip | same file |
| JSON / XML | Errors, duplicates, JSONL, comments, CDATA, entity block, mapping, tree edits, templates | `tests/unit/structured.test.ts` |
| JSONPath / XPath | Queries, code expressions blocked | structured tests |
| Images | Rotate, crop, WebP, BMP-as-PNG warning, region replace, project round-trip | `tests/unit/image-pdf.test.ts` |
| PDF pages | Rotate, delete, merge, markup annotations, image embed, forms, added text | image-pdf tests |
| Searchable PDF text | Invisible Helvetica layer from placed word boxes, then extracted back | `tests/unit/recovery.test.ts` |
| Redaction | Content-stream removal with a read-back check, refused when the page draws an image | image-pdf tests |
| Recovery JSON | File name, round-trip, incomplete file rejected | recovery tests |
| Webpage address | Public http(s) allowed; file, password, and private hosts refused | recovery tests |
| Shell | Open, tabs, save, settings, batch queue | `tests/e2e/launch.spec.ts` opens the home screen |

Not claimed as complete: arbitrary existing-PDF text editing, secure redaction of embedded images, animated GIF editing, signed installers, OCR of a real scan in the automated suite, or an end-to-end check of the recovery list and webpage button. The installer on disk is unsigned and may be older than this source.
