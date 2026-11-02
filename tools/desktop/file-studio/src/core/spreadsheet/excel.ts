import ExcelJS from 'exceljs'
import type { ParsedTable, TextRun } from '../html/parse-tables'
import { classifyScalar, escapeFormulaText, excelScalar, safeFileName, type ScalarType } from '../security/names'

export interface ExcelExportOptions {
  tables: ParsedTable[]
  sheetNames?: string[]
  headerStyle?: boolean
  freezeHeader?: boolean
  autoFilter?: boolean
  combineCompatible?: boolean
}

export async function tablesToXlsx(options: ExcelExportOptions): Promise<Uint8Array> {
  const tables = options.combineCompatible ? [combineTables(options.tables)] : options.tables
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'File Studio'
  const used = new Set<string>()
  tables.forEach((table, index) => {
    const name = uniqueSheetName(options.sheetNames?.[index] || table.name || `Table ${index + 1}`, used)
    const sheet = workbook.addWorksheet(name)
    writeTable(sheet, table, {
      headerStyle: options.headerStyle ?? true,
      freezeHeader: options.freezeHeader ?? true,
      autoFilter: options.autoFilter ?? true
    })
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

export async function rowsToXlsx(headers: string[], rows: string[][], sheetName = 'Data'): Promise<Uint8Array> {
  const table: ParsedTable = {
    id: 'mapped',
    name: sheetName,
    caption: null,
    headerRowCount: 1,
    merges: [],
    rows: [
      headers.map((header) => ({
        runs: [{ text: header, bold: true }],
        text: header,
        rowSpan: 1,
        colSpan: 1,
        header: true,
        hidden: false,
        covered: false
      })),
      ...rows.map((row) =>
        row.map((value) => ({
          runs: [{ text: value }],
          text: value,
          rowSpan: 1,
          colSpan: 1,
          header: false,
          hidden: false,
          covered: false
        }))
      )
    ]
  }
  return tablesToXlsx({ tables: [table], sheetNames: [sheetName] })
}

export function sheetNameFrom(name: string): string {
  return uniqueSheetName(name, new Set())
}

function writeTable(
  sheet: ExcelJS.Worksheet,
  table: ParsedTable,
  flags: { headerStyle: boolean; freezeHeader: boolean; autoFilter: boolean }
): void {
  const types = columnTypes(table)
  table.rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell.covered) return
      const target = sheet.getCell(rowIndex + 1, colIndex + 1)
      const type = rowIndex < table.headerRowCount ? 'string' : types[colIndex]
      target.value = cellValue(cell.runs, cell.text, type)
      if (flags.headerStyle && rowIndex < table.headerRowCount) {
        target.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E5A' } }
      } else if (type === 'date') {
        target.numFmt = 'yyyy-mm-dd'
      }
    })
  })
  for (const merge of table.merges) {
    if (merge.rowSpan < 2 && merge.colSpan < 2) continue
    sheet.mergeCells(merge.row + 1, merge.col + 1, merge.row + merge.rowSpan, merge.col + merge.colSpan)
  }
  const width = table.rows[0]?.length ?? 1
  for (let column = 1; column <= width; column += 1) {
    let max = 10
    for (const row of table.rows) {
      max = Math.max(max, Math.min(48, (row[column - 1]?.text.length ?? 0) + 2))
    }
    sheet.getColumn(column).width = max
  }
  if (flags.freezeHeader && table.headerRowCount > 0) {
    sheet.views = [{ state: 'frozen', ySplit: table.headerRowCount }]
  }
  if (flags.autoFilter && table.rows.length > 0 && width > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: table.rows.length, column: width }
    }
  }
}

function cellValue(runs: TextRun[], text: string, type: ScalarType): ExcelJS.CellValue {
  const styled = runs.some((run) => run.bold || run.italic)
  if (styled && runs.length > 0) {
    let prefixed = false
    return {
      richText: runs.map((run) => {
        let value = run.text
        if (!prefixed && /^[=+\-@\t\r]/.test(value)) {
          value = `'${value}`
          prefixed = true
        }
        return { text: value, font: { bold: !!run.bold, italic: !!run.italic } }
      })
    }
  }
  return excelScalar(text, type)
}

function columnTypes(table: ParsedTable): ScalarType[] {
  const width = table.rows[0]?.length ?? 0
  const types: ScalarType[] = []
  for (let column = 0; column < width; column += 1) {
    const values = table.rows
      .slice(table.headerRowCount)
      .map((row) => row[column])
      .filter((cell) => cell && !cell.covered && cell.text.trim() !== '')
      .map((cell) => classifyScalar(cell.text))
    types.push(values.length > 0 && values.every((type) => type === values[0]) ? values[0] : 'string')
  }
  return types
}

function combineTables(tables: ParsedTable[]): ParsedTable {
  if (tables.length === 0) throw new Error('No tables to combine.')
  if (tables.length === 1) return tables[0]
  const header = tables[0].rows[0]?.map((cell) => cell.text) ?? []
  for (const table of tables.slice(1)) {
    const candidate = table.rows[0]?.map((cell) => cell.text) ?? []
    if (candidate.length !== header.length || candidate.some((value, index) => value !== header[index])) {
      throw new Error('Tables cannot be combined because their headers do not match.')
    }
  }
  const rows = [
    tables[0].rows[0],
    ...tables.flatMap((table) => table.rows.slice(Math.max(table.headerRowCount, 1)))
  ]
  return {
    id: 'combined',
    name: 'Combined',
    caption: null,
    headerRowCount: 1,
    merges: [],
    rows
  }
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const cleaned = safeFileName(name).replace(/[\][*?/\\:]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = cleaned
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`
    n += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export { escapeFormulaText }
