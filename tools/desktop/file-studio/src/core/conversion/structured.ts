import { matrixToCsv } from '../csv/csv'
import { parseStructuredText } from '../json/document'
import { applyMapping, listRecordPaths, suggestMapping } from '../mapping/map-records'
import type { CsvDelimiter } from '@shared/types'

export interface StructuredCsvOptions {
  recordPath?: string
  expandPath?: string | null
  delimiter?: CsvDelimiter
  bom?: boolean
  fileName?: string
}

export function structuredTextToCsv(text: string, options: StructuredCsvOptions = {}): { csv: string; rowCount: number; recordPath: string } {
  const parsed = parseStructuredText(text, options.fileName ?? 'data.json')
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message ?? 'The file is not valid JSON or JSONL.')
  const recordPath = options.recordPath || listRecordPaths(parsed.value)[0]
  if (!recordPath) throw new Error('No array of records was found. A JSON object by itself is not a table.')
  const mapping = suggestMapping(parsed.value, recordPath, options.expandPath ?? null)
  if (mapping.columns.length === 0) throw new Error('The records have no scalar columns to export.')
  const table = applyMapping(parsed.value, mapping)
  return {
    csv: matrixToCsv(table.headers, table.rows, { delimiter: options.delimiter, bom: options.bom !== false }),
    rowCount: table.rows.length,
    recordPath
  }
}
