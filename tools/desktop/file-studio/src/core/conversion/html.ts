import { tablesToCsv } from '../csv/csv'
import { parseHtmlTables, type ParsedTable } from '../html/parse-tables'
import { tablesToXlsx } from '../spreadsheet/excel'
import type { CsvDelimiter } from '@shared/types'
import { throwIfAborted, type Converter } from './types'

export interface HtmlOptions {
  includeHidden?: boolean
}

export const htmlToExcel: Converter<string, Uint8Array, HtmlOptions> = {
  id: 'html-to-excel',
  async validate(input) {
    return validateTables(input)
  },
  async preview(input, options) {
    const tables = parseHtmlTables(input, options)
    return {
      summary: `${tables.length} table${tables.length === 1 ? '' : 's'} ready for Excel`,
      detail: summarize(tables)
    }
  },
  async convert(input, options, context) {
    throwIfAborted(context?.signal)
    context?.onProgress?.(0.3, 'Reading tables')
    const tables = parseHtmlTables(input, options)
    if (tables.length === 0) throw new Error('No HTML tables were found.')
    context?.onProgress?.(0.7, 'Writing workbook')
    const bytes = await tablesToXlsx({ tables })
    context?.onProgress?.(1, 'Done')
    return bytes
  }
}

export const htmlToCsv: Converter<string, ReturnType<typeof tablesToCsv>, HtmlOptions & { delimiter?: CsvDelimiter; bom?: boolean }> = {
  id: 'html-to-csv',
  async validate(input) {
    return validateTables(input)
  },
  async preview(input, options) {
    const tables = parseHtmlTables(input, options)
    const files = tablesToCsv(tables, { delimiter: options.delimiter, bom: options.bom })
    return {
      summary: `${files.length} CSV file${files.length === 1 ? '' : 's'}`,
      detail: files.map((file) => ({ fileName: file.fileName, warning: file.warning, bytes: file.contents.length }))
    }
  },
  async convert(input, options, context) {
    throwIfAborted(context?.signal)
    const tables = parseHtmlTables(input, options)
    if (tables.length === 0) throw new Error('No HTML tables were found.')
    return tablesToCsv(tables, { delimiter: options.delimiter, bom: options.bom })
  }
}

function validateTables(input: string) {
  const tables = parseHtmlTables(input)
  if (tables.length === 0) return { ok: false, errors: ['No HTML tables were found.'], warnings: [] }
  return { ok: true, errors: [], warnings: [] }
}

function summarize(tables: ParsedTable[]) {
  return tables.map((table) => ({
    id: table.id,
    name: table.name,
    rows: table.rows.length,
    columns: table.rows[0]?.length ?? 0,
    merges: table.merges.length
  }))
}
