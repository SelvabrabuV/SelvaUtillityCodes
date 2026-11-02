# Licensing

DiffDesk's own source in this repo is part of SelvaUtillityCodes. The libraries it calls are permissive. AGPL libraries are not used.

| Library | Role | License |
| --- | --- | --- |
| .NET 10 | Runtime | MIT |
| Avalonia 12.1.2 and Avalonia.Controls.DataGrid 12.1.2 | Window | MIT |
| AvaloniaEdit 12.0.0 | Text editor | MIT |
| CommunityToolkit.Mvvm 8.4.2 | View models | MIT |
| DiffPlex 1.9.0 | Text diff | Apache-2.0 |
| CsvHelper 33.1.0 | CSV | MS-PL / Apache-2.0 dual |
| ClosedXML 0.105.0 | XLSX read | MIT |
| DocumentFormat.OpenXml 3.2.0 | DOCX text | MIT |
| PdfPig 0.1.16 | PDF text | Apache-2.0 |
| Serilog 4.2.0 and Serilog.Sinks.File 6.0.0 | Log file | Apache-2.0 |
| System.Drawing.Common 10.0.0 | Image decode on Windows | MIT |

Image comparison uses `System.Drawing.Common` because current ImageSharp releases need a Six Labors license key for a Release build, and older ImageSharp builds have published security advisories. GDI+ is Windows-only. A machine without a codec for a format reports that the image could not be decoded.
