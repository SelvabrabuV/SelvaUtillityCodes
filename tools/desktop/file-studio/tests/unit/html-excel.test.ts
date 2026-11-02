import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseCsv, tableToCsv } from '../../src/core/csv/csv'
import { htmlToExcel } from '../../src/core/conversion/html'
import {
  applyTsv,
  deleteColumn,
  findReplace,
  matchingBodyRows,
  parseHtmlTables,
  setCellText,
  sortTable
} from '../../src/core/html/parse-tables'
import { tablesToXlsx } from '../../src/core/spreadsheet/excel'

const fiveTables = `
<table><caption>People</caption><tr><th>Name</th><th>City</th></tr><tr><td>Ada</td><td>London</td></tr></table>
<table><thead><tr><th>Sku</th><th>Qty</th></tr></thead><tbody><tr><td>A1</td><td>2</td></tr></tbody><tfoot><tr><td>Total</td><td>2</td></tr></tfoot></table>
<table><tr><th colspan="2">Name</th><th rowspan="2">Qty</th></tr><tr><th>First</th><th>Last</th></tr><tr><td>Grace</td><td>Hopper</td><td>3</td></tr></table>
<table><tr><td>caf&eacute; &amp; 東京</td><td>line<br>break</td><td><b>Bold</b> <i>lean</i></td></tr></table>
<table><tr><td>visible</td><td style="display:none">secret</td><td>=HYPERLINK("http://evil")</td></tr></table>
<script>document.body.innerHTML = '<table><tr><td>pwned</td></tr></table>'</script>
`

describe('HTML tables', () => {
  it('detects five tables and ignores scripts', () => {
    const tables = parseHtmlTables(fiveTables)
    expect(tables).toHaveLength(5)
    expect(tables.map((table) => table.name)).toContain('People')
    expect(JSON.stringify(tables)).not.toContain('pwned')
  })

  it('keeps captions, sections, spans, entities, breaks, and hidden cells', () => {
    const tables = parseHtmlTables(fiveTables)
    expect(tables[1].rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['Sku', 'Qty'],
      ['A1', '2'],
      ['Total', '2']
    ])
    const merged = tables[2]
    expect(merged.merges).toEqual([
      { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { row: 0, col: 2, rowSpan: 2, colSpan: 1 }
    ])
    expect(merged.rows[2].map((cell) => cell.text)).toEqual(['Grace', 'Hopper', '3'])
    expect(tables[3].rows[0][0].text).toBe('café & 東京')
    expect(tables[3].rows[0][1].text).toBe('line\nbreak')
    expect(tables[3].rows[0][2].runs.some((run) => run.bold)).toBe(true)
    expect(tables[4].rows[0][1].text).toBe('')
    expect(parseHtmlTables(fiveTables, { includeHidden: true })[4].rows[0][1].text).toBe('secret')
  })

  it('separates nested tables from the parent cell', () => {
    const tables = parseHtmlTables('<table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td></tr></table>')
    expect(tables).toHaveLength(2)
    expect(tables[0].rows[0][0].text.trim()).toBe('Outer')
    expect(tables[1].rows[0][0].text).toBe('Inner')
  })

  it('edits, sorts, pastes, and finds text', () => {
    let table = parseHtmlTables('<table><tr><th>N</th></tr><tr><td>b</td></tr><tr><td>a</td></tr></table>')[0]
    table = setCellText(table, 1, 0, 'c')
    table = applyTsv(table, 2, 0, 'z')
    const found = findReplace(table, 'c', 'd')
    expect(found.count).toBe(1)
    const sorted = sortTable(found.table, 0, 'asc')
    expect(sorted.rows.slice(1).map((row) => row[0].text)).toEqual(['d', 'z'])
    expect(deleteColumn(sorted, 0).rows[0]).toHaveLength(0)
  })
})

describe('Excel and CSV round-trip', () => {
  it('writes one sheet per table and reads the values back', async () => {
    const tables = parseHtmlTables(fiveTables)
    const bytes = await tablesToXlsx({ tables })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(bytes) as never)
    expect(workbook.worksheets).toHaveLength(5)
    const people = workbook.getWorksheet('People')
    expect(people?.getCell('A2').value).toBe('Ada')
    const merged = workbook.worksheets[2]
    expect(merged.getCell('A1').value).toBe('Name')
    expect(merged.getCell('A1').isMerged).toBe(true)
    expect(merged.getCell('C1').value).toBe('Qty')
    expect(merged.getCell('A3').value).toBe('Grace')
    const risky = workbook.worksheets[4].getCell('C1')
    expect(risky.type).not.toBe(ExcelJS.ValueType.Formula)
    expect(String(risky.value)).toContain('HYPERLINK')
    const preview = await htmlToExcel.preview(fiveTables, {})
    expect(preview.summary).toContain('5 tables')
  })

  it('exports CSV that survives a parse', () => {
    const table = parseHtmlTables('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>hello, world</td></tr></table>')[0]
    const csv = tableToCsv(table, { bom: true, delimiter: ',' })
    expect(csv.contents.charCodeAt(0)).toBe(0xfeff)
    const rows = parseCsv(csv.contents)
    expect(rows).toEqual([
      ['A', 'B'],
      ['1', 'hello, world']
    ])
  })

  it('filters body rows without dropping the header', () => {
    const table = parseHtmlTables('<table><tr><th>Name</th></tr><tr><td>Ada</td></tr><tr><td>Grace</td></tr></table>')[0]
    expect(matchingBodyRows(table, 0, 'ada')).toEqual([1])
    expect(matchingBodyRows(table, 0, '')).toEqual([1, 2])
  })

  it('refuses to combine tables with different headers', async () => {
    const tables = parseHtmlTables(fiveTables).slice(0, 2)
    await expect(tablesToXlsx({ tables, combineCompatible: true })).rejects.toThrow(/headers/i)
  })
})
