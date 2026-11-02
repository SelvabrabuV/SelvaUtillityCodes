# Licensing

File Studio's application code in this repository is private (`UNLICENSED` in package.json). Third-party libraries keep their own licenses. None of the chosen libraries are AGPL.

| Library | Use | License |
| --- | --- | --- |
| Electron | Desktop shell | MIT |
| React | UI | MIT |
| pdf.js | View and extract PDF text | Apache-2.0 |
| pdf-lib | PDF page edits, forms, annotations | MIT |
| tesseract.js | Local OCR | Apache-2.0 |
| @tesseract.js-data/eng | English OCR data | Apache-2.0 |
| sharp | Image decode and convert | Apache-2.0 |
| Fabric.js | Canvas editing | MIT |
| ExcelJS | XLSX | MIT |
| Papa Parse | CSV | MIT |
| Cheerio | HTML parse | MIT |
| fast-xml-parser | XML | MIT |
| fontoxpath | XPath | MIT |
| jsonpath-plus | JSONPath, with code execution disabled | MIT |
| Monaco Editor | Source editing | MIT |

MuPDF and other AGPL PDF engines are not included. Existing PDF text is edited only through `pdf-lib` content streams, and the UI says when a change is an overlay instead.
