# Feature matrix

| Area | What works | How it is checked |
| --- | --- | --- |
| HTML tables | Multiple tables, spans, captions, entities, hidden cells, script stripped | `tests/unit/html-excel.test.ts` |
| Excel / CSV | Sheet per table, merges, formula text, CSV round-trip | same file |
| JSON / XML | Errors, duplicates, JSONL, comments, CDATA, entity block, mapping | `tests/unit/structured.test.ts` |
| JSONPath / XPath | Queries, code expressions blocked | structured tests |
| Images | Rotate, WebP, region replace, project round-trip | `tests/unit/image-pdf.test.ts` |
| PDF pages | Rotate, delete, merge, annotations, forms, added text | image-pdf tests |
| Redaction | Content-stream removal with a read-back check, refused when unsupported | image-pdf tests |
| Shell | Open, tabs, save, settings, batch queue | `tests/e2e/launch.spec.ts` opens the home screen |

Not claimed as complete: arbitrary existing-PDF text editing, secure redaction of embedded images, animated GIF editing, signed installers.
