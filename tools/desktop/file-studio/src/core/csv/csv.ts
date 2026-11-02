import Papa from 'papaparse'
import type { ParsedTable } from '../html/parse-tables'
import type { CsvDelimiter } from '@shared/types'
import { escapeFormulaText, safeFileName } from '../security/names'

export interface CsvExportOptions {
  delimiter?: CsvDelimiter
  bom?: boolean
  includeHeaders?: boolean
  newline?: '\n' | '\r\n'
}

export interface CsvFile {
  fileName: string
  contents: string
  warning?: string
}

export function tableToCsv(table: ParsedTable, options: CsvExportOptions = {}): CsvFile {
  const delimiter = options.delimiter ?? ','
  const newline = options.newline ?? '\r\n'
  const includeHeaders = options.includeHeaders ?? table.headerRowCount > 0
  const headerCount = includeHeaders ? Math.max(table.headerRowCount, 1) : 0
  const header = headerCount > 0 ? table.rows[0].map((cell) => (cell.covered ? '' : cell.text)) : undefined
  const body = table.rows.slice(headerCount).map((row) => row.map((cell) => (cell.covered ? '' : escapeFormulaText(cell.text))))
  const contents = Papa.unparse(header ? { fields: header, data: body } : body, {
    delimiter,
    newline,
    header: Boolean(header)
  })
  return {
    fileName: `${safeFileName(table.name)}.csv`,
    contents: options.bom ? `\uFEFF${contents}` : contents,
    warning:
      table.headerRowCount > 1
        ? 'CSV keeps only the first header row. Extra header rows are written as data.'
        : table.merges.length > 0
          ? 'CSV cannot store merged cells. The value stays in the top-left cell and covered cells are blank.'
          : undefined
  }
}

export function tablesToCsv(tables: ParsedTable[], options: CsvExportOptions = {}): CsvFile[] {
  const used = new Set<string>()
  return tables.map((table) => {
    const file = tableToCsv(table, options)
    let name = file.fileName
    let n = 2
    while (used.has(name.toLowerCase())) {
      name = file.fileName.replace(/\.csv$/i, `-${n}.csv`)
      n += 1
    }
    used.add(name.toLowerCase())
    return { ...file, fileName: name }
  })
}

export function parseCsv(text: string, delimiter: CsvDelimiter = ','): string[][] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter,
    skipEmptyLines: false
  })
  return parsed.data.filter((row) => row.some((cell) => cell !== ''))
}
