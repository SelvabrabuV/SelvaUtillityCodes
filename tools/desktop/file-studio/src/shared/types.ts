export type ThemeChoice = 'light' | 'dark' | 'system'
export type CsvDelimiter = ',' | ';' | '\t'
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'tiff' | 'bmp' | 'gif'
export type DocKind = 'html' | 'structured' | 'image' | 'pdf' | 'project'

export interface AppSettings {
  theme: ThemeChoice
  exportFolder: string
  recentLimit: number
  csvDelimiter: CsvDelimiter
  csvBom: boolean
  csvNewline: '\n' | '\r\n'
  excelHeaderStyle: boolean
  jsonIndent: number
  xmlIndent: number
  largeFileBytes: number
  imageQuality: number
  imageFormat: 'png' | 'jpeg' | 'webp'
  pdfZoom: 'fit-page' | 'fit-width' | '100'
  autosave: boolean
  uiDensity: 'comfortable' | 'compact'
  includeHiddenHtml: boolean
}

export const defaultSettings: AppSettings = {
  theme: 'system',
  exportFolder: '',
  recentLimit: 12,
  csvDelimiter: ',',
  csvBom: true,
  csvNewline: '\r\n',
  excelHeaderStyle: true,
  jsonIndent: 2,
  xmlIndent: 2,
  largeFileBytes: 8_000_000,
  imageQuality: 0.92,
  imageFormat: 'png',
  pdfZoom: 'fit-width',
  autosave: true,
  uiDensity: 'comfortable',
  includeHiddenHtml: false
}

export interface RecentFile {
  path: string
  name: string
  kind: DocKind
  openedAt: number
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
}
