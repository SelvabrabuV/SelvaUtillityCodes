import { classifyScalar, type ScalarType } from '../security/names'

export interface ColumnMap {
  sourcePath: string
  outputColumn: string
  dataType: ScalarType
  defaultValue: string
  include: boolean
}

export interface RecordMapping {
  recordPath: string
  expandPath: string | null
  columns: ColumnMap[]
}

export interface MappedTable {
  headers: string[]
  rows: string[][]
}

export function listRecordPaths(value: unknown, limit = 200): string[] {
  const paths: string[] = []
  walk(value, '$', paths, limit)
  return paths
}

export function arrayKeys(value: unknown, recordPath: string): string[] {
  const records = getPath(value, recordPath)
  const sample = Array.isArray(records) ? records.find((item) => item && typeof item === 'object' && !Array.isArray(item)) : null
  if (!sample || typeof sample !== 'object') return []
  return Object.entries(sample as Record<string, unknown>)
    .filter(([, child]) => Array.isArray(child))
    .map(([key]) => key)
}

export function suggestMapping(value: unknown, recordPath: string, expandPath: string | null): RecordMapping {
  const records = getPath(value, recordPath)
  const sample = Array.isArray(records) ? records.find((item) => item && typeof item === 'object') : undefined
  const columns: ColumnMap[] = []
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    for (const [key, child] of Object.entries(sample as Record<string, unknown>)) {
      if (expandPath === key) continue
      if (child && typeof child === 'object') continue
      columns.push(column(key, key, classifyScalar(child == null ? '' : String(child))))
    }
  }
  if (expandPath && sample && typeof sample === 'object') {
    const nested = (sample as Record<string, unknown>)[expandPath]
    const item = Array.isArray(nested) ? nested.find((entry) => entry && typeof entry === 'object') : undefined
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        if (child && typeof child === 'object') continue
        columns.push(column(`${expandPath}.${key}`, key, classifyScalar(child == null ? '' : String(child))))
      }
    }
  }
  return { recordPath, expandPath, columns }
}

export function applyMapping(root: unknown, mapping: RecordMapping): MappedTable {
  const records = getPath(root, mapping.recordPath)
  if (!Array.isArray(records)) throw new Error(`Record path ${mapping.recordPath} is not an array.`)
  const columns = mapping.columns.filter((columnMap) => columnMap.include)
  const rows: string[][] = []
  for (const record of records) {
    const expanded = mapping.expandPath ? getPath(record, mapping.expandPath) : undefined
    const items = mapping.expandPath ? (Array.isArray(expanded) && expanded.length > 0 ? expanded : [undefined]) : [undefined]
    for (const item of items) {
      rows.push(
        columns.map((columnMap) => readMapped(record, item, mapping.expandPath, columnMap))
      )
    }
  }
  return { headers: columns.map((columnMap) => columnMap.outputColumn), rows }
}

export function getPath(root: unknown, path: string): unknown {
  if (path === '' || path === '$') return root
  const parts = tokenizePath(path)
  let current: unknown = root
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    if (typeof part === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[part]
    } else {
      current = (current as Record<string, unknown>)[part]
    }
  }
  return current
}

function readMapped(record: unknown, item: unknown, expandPath: string | null, columnMap: ColumnMap): string {
  const fromItem = expandPath != null && (columnMap.sourcePath === expandPath || columnMap.sourcePath.startsWith(`${expandPath}.`))
  const relative = fromItem ? columnMap.sourcePath.slice(expandPath.length + 1) : columnMap.sourcePath
  const source = fromItem ? item : record
  const value = relative ? getPath(source, relative) : source
  if (value === undefined || value === null || value === '') return columnMap.defaultValue
  if (typeof value === 'object') return JSON.stringify(value)
  if (columnMap.dataType === 'number') return Number.isFinite(Number(value)) ? String(Number(value)) : columnMap.defaultValue
  if (columnMap.dataType === 'boolean') return /^(true|false)$/i.test(String(value)) ? String(value).toLowerCase() : columnMap.defaultValue
  return String(value)
}

function tokenizePath(path: string): Array<string | number> {
  const body = path.replace(/^\$\.?/, '')
  const parts: Array<string | number> = []
  for (const segment of body.split('.')) {
    if (!segment) continue
    const pattern = /([^[\].]+)|\[(\d+)\]/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(segment))) {
      if (match[1]) parts.push(match[1])
      else parts.push(Number(match[2]))
    }
  }
  return parts
}

function walk(value: unknown, path: string, paths: string[], limit: number): void {
  if (paths.length >= limit || value == null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object')) paths.push(path)
    value.slice(0, 20).forEach((item, index) => walk(item, `${path}[${index}]`, paths, limit))
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walk(child, path === '$' ? `$.${key}` : `${path}.${key}`, paths, limit)
  }
}

function column(sourcePath: string, outputColumn: string, dataType: ScalarType): ColumnMap {
  return { sourcePath, outputColumn, dataType, defaultValue: '', include: true }
}
