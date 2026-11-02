import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
}

export interface TableCell {
  runs: TextRun[]
  text: string
  rowSpan: number
  colSpan: number
  header: boolean
  hidden: boolean
  covered: boolean
}

export interface CellMerge {
  row: number
  col: number
  rowSpan: number
  colSpan: number
}

export interface ParsedTable {
  id: string
  name: string
  caption: string | null
  rows: TableCell[][]
  merges: CellMerge[]
  headerRowCount: number
}

export interface ParseHtmlOptions {
  includeHidden?: boolean
}

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed'])

export function parseHtmlTables(html: string, options: ParseHtmlOptions = {}): ParsedTable[] {
  const includeHidden = options.includeHidden ?? false
  const $ = cheerio.load(html)
  $('script, style, noscript, iframe, object, embed, link, meta').remove()
  const tables: ParsedTable[] = []
  $('table').each((index, element) => {
    tables.push(parseOne($, element, index, includeHidden))
  })
  return tables
}

export function tableToMatrix(table: ParsedTable): string[][] {
  return table.rows.map((row) => row.map((cell) => (cell.covered ? '' : cell.text)))
}

export function setCellText(table: ParsedTable, row: number, col: number, text: string): ParsedTable {
  const next = cloneTable(table)
  const cell = next.rows[row]?.[col]
  if (!cell || cell.covered) throw new Error('That cell cannot be edited.')
  cell.text = text
  cell.runs = [{ text }]
  return next
}

export function deleteRow(table: ParsedTable, rowIndex: number): ParsedTable {
  if (rowIndex < 0 || rowIndex >= table.rows.length) throw new Error('Row is out of range.')
  const next = cloneTable(table)
  next.merges = next.merges.flatMap((merge) => {
    const end = merge.row + merge.rowSpan
    if (rowIndex < merge.row) return [{ ...merge, row: merge.row - 1 }]
    if (rowIndex >= end) return [merge]
    if (merge.row === rowIndex && merge.rowSpan === 1) return []
    if (merge.row === rowIndex) return [{ ...merge, rowSpan: merge.rowSpan - 1 }]
    return [{ ...merge, rowSpan: merge.rowSpan - 1 }]
  })
  next.rows.splice(rowIndex, 1)
  next.headerRowCount = Math.min(next.headerRowCount, next.rows.length)
  return next
}

export function deleteColumn(table: ParsedTable, colIndex: number): ParsedTable {
  const width = table.rows[0]?.length ?? 0
  if (colIndex < 0 || colIndex >= width) throw new Error('Column is out of range.')
  const next = cloneTable(table)
  next.merges = next.merges.flatMap((merge) => {
    const end = merge.col + merge.colSpan
    if (colIndex < merge.col) return [{ ...merge, col: merge.col - 1 }]
    if (colIndex >= end) return [merge]
    if (merge.colSpan === 1) return []
    return [{ ...merge, colSpan: merge.colSpan - 1 }]
  })
  next.rows = next.rows.map((row) => row.filter((_, index) => index !== colIndex))
  return next
}

export function findReplace(
  table: ParsedTable,
  find: string,
  replace: string,
  matchCase = false
): { table: ParsedTable; count: number } {
  if (!find) return { table, count: 0 }
  const next = cloneTable(table)
  let count = 0
  const flags = matchCase ? 'g' : 'gi'
  const pattern = new RegExp(escapeRegExp(find), flags)
  for (const row of next.rows) {
    for (const cell of row) {
      if (cell.covered || !cell.text) continue
      const updated = cell.text.replace(pattern, () => {
        count += 1
        return replace
      })
      if (updated !== cell.text) {
        cell.text = updated
        cell.runs = [{ text: updated }]
      }
    }
  }
  return { table: next, count }
}

export function sortTable(table: ParsedTable, column: number, direction: 'asc' | 'desc'): ParsedTable {
  const next = cloneTable(table)
  const header = next.rows.slice(0, next.headerRowCount)
  const body = next.rows.slice(next.headerRowCount)
  body.sort((a, b) => {
    const left = a[column]?.text ?? ''
    const right = b[column]?.text ?? ''
    const compared = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
    return direction === 'asc' ? compared : -compared
  })
  next.rows = [...header, ...body]
  next.merges = []
  for (const row of next.rows) {
    for (const cell of row) {
      cell.rowSpan = 1
      cell.colSpan = 1
      cell.covered = false
    }
  }
  return next
}

export function applyTsv(table: ParsedTable, row: number, col: number, tsv: string): ParsedTable {
  const pasted = tsv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((line) => line.split('\t'))
  const next = cloneTable(table)
  for (let r = 0; r < pasted.length; r += 1) {
    for (let c = 0; c < pasted[r].length; c += 1) {
      const target = next.rows[row + r]?.[col + c]
      if (!target || target.covered) continue
      target.text = pasted[r][c]
      target.runs = [{ text: pasted[r][c] }]
    }
  }
  return next
}

export function renameHeader(table: ParsedTable, column: number, name: string): ParsedTable {
  if (table.headerRowCount < 1) throw new Error('This table has no header row.')
  return setCellText(table, 0, column, name)
}

/** Body-row indexes whose visible text contains the query. An empty query returns every body row. */
export function matchingBodyRows(table: ParsedTable, column: number, query: string): number[] {
  const needle = query.trim().toLocaleLowerCase()
  const indexes: number[] = []
  for (let index = table.headerRowCount; index < table.rows.length; index += 1) {
    const cells = column >= 0 ? [table.rows[index]?.[column]] : table.rows[index]
    const hit =
      !needle ||
      (cells ?? []).some((cell) => cell && !cell.covered && cell.text.toLocaleLowerCase().includes(needle))
    if (hit) indexes.push(index)
  }
  return indexes
}

function parseOne(
  $: cheerio.CheerioAPI,
  tableEl: Element,
  index: number,
  includeHidden: boolean
): ParsedTable {
  const caption = $(tableEl).children('caption').first().text().replace(/\s+/g, ' ').trim() || null
  const rowEls = directRows($, tableEl)
  const grid: TableCell[][] = []
  const occupied: boolean[][] = []
  const merges: CellMerge[] = []

  rowEls.forEach((rowEl, rowIndex) => {
    ensureRow(grid, occupied, rowIndex)
    let column = 0
    const rowHidden = isHidden(rowEl)
    $(rowEl)
      .children('td, th')
      .each((_, cellNode) => {
        const cellEl = cellNode as Element
        while (occupied[rowIndex]?.[column]) column += 1
        const rowSpan = clampSpan(cellEl.attribs?.rowspan)
        const colSpan = clampSpan(cellEl.attribs?.colspan)
        const hidden = rowHidden || isHidden(cellEl)
        const runs = hidden && !includeHidden ? [] : collectRuns($, cellEl)
        const text = hidden && !includeHidden ? '' : normalizeText(runs.map((run) => run.text).join(''))
        const cell: TableCell = {
          runs: hidden && !includeHidden ? [] : runs.map((run) => ({ ...run, text: normalizeText(run.text) })),
          text,
          rowSpan,
          colSpan,
          header: cellEl.name === 'th',
          hidden,
          covered: false
        }
        ensureRow(grid, occupied, rowIndex)
        grid[rowIndex][column] = cell
        for (let rr = 0; rr < rowSpan; rr += 1) {
          for (let cc = 0; cc < colSpan; cc += 1) {
            ensureRow(grid, occupied, rowIndex + rr)
            occupied[rowIndex + rr][column + cc] = true
            if (rr === 0 && cc === 0) continue
            grid[rowIndex + rr][column + cc] = emptyCell(true)
          }
        }
        if (rowSpan > 1 || colSpan > 1) {
          merges.push({ row: rowIndex, col: column, rowSpan, colSpan })
        }
        column += colSpan
      })
  })

  const width = grid.reduce((max, row) => Math.max(max, row.length), 0)
  for (const row of grid) {
    for (let column = 0; column < width; column += 1) {
      if (!row[column]) row[column] = emptyCell(false)
    }
  }

  return {
    id: `table-${index + 1}`,
    name: caption || `Table ${index + 1}`,
    caption,
    rows: grid,
    merges,
    headerRowCount: leadingHeaderRows(grid)
  }
}

function directRows($: cheerio.CheerioAPI, table: Element): Element[] {
  const sections = $(table).children('thead, tbody, tfoot').toArray() as Element[]
  const parents = sections.length > 0 ? sections : [table]
  const rows: Element[] = []
  for (const parent of parents) {
    for (const row of $(parent).children('tr').toArray()) rows.push(row as Element)
  }
  return rows
}

function collectRuns($: cheerio.CheerioAPI, el: Element, bold = false, italic = false): TextRun[] {
  const runs: TextRun[] = []
  const push = (text: string, nextBold = bold, nextItalic = italic) => {
    if (!text) return
    const previous = runs[runs.length - 1]
    if (previous && !!previous.bold === nextBold && !!previous.italic === nextItalic) {
      previous.text += text
      return
    }
    runs.push({
      text,
      ...(nextBold ? { bold: true } : {}),
      ...(nextItalic ? { italic: true } : {})
    })
  }
  $(el)
    .contents()
    .each((_, node) => {
      if (node.type === 'text') {
        push(node.data)
        return
      }
      if (node.type !== 'tag') return
      const element = node as Element
      const name = element.name.toLowerCase()
      if (name === 'table' || SKIP_TAGS.has(name)) return
      if (name === 'br') {
        push('\n')
        return
      }
      const nextBold = bold || name === 'b' || name === 'strong'
      const nextItalic = italic || name === 'i' || name === 'em'
      if ((name === 'p' || name === 'div' || name === 'li') && runs.length > 0) push('\n')
      for (const run of collectRuns($, element, nextBold, nextItalic)) {
        push(run.text, !!run.bold, !!run.italic)
      }
    })
  return runs
}

function isHidden(el: Element): boolean {
  if (el.attribs?.hidden !== undefined && el.attribs.hidden !== 'false') return true
  const style = (el.attribs?.style ?? '').toLowerCase().replace(/\s+/g, '')
  return style.includes('display:none') || style.includes('visibility:hidden')
}

function clampSpan(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, 100)
}

function ensureRow(grid: TableCell[][], occupied: boolean[][], index: number): void {
  while (grid.length <= index) {
    grid.push([])
    occupied.push([])
  }
}

function emptyCell(covered: boolean): TableCell {
  return { runs: [], text: '', rowSpan: 1, colSpan: 1, header: false, hidden: false, covered }
}

function leadingHeaderRows(rows: TableCell[][]): number {
  let count = 0
  for (const row of rows) {
    const visible = row.filter((cell) => !cell.covered)
    if (visible.length === 0 || !visible.every((cell) => cell.header)) break
    count += 1
  }
  return count
}

function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function cloneTable(table: ParsedTable): ParsedTable {
  return structuredClone(table)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
