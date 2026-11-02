import { describe, expect, it } from 'vitest'
import { structuredTextToCsv } from '../../src/core/conversion/structured'
import { addChild, formatJson, parseJson, parseStructuredText, removeNode, renameKey, treeToValue, valueToTree } from '../../src/core/json/document'
import { applyMapping, arrayKeys, getPath, suggestMapping, upsertTemplate, writeMappedCell } from '../../src/core/mapping/map-records'
import { queryJsonPath, queryXPath } from '../../src/core/query/query'
import { formatXml, jsonToXml, parseXml, xmlToJson } from '../../src/core/xml/document'
import { rowsToXlsx } from '../../src/core/spreadsheet/excel'
import ExcelJS from 'exceljs'

const orders = {
  orders: [
    {
      id: 'O001',
      customer: 'John',
      items: [
        { product: 'Laptop', quantity: 1 },
        { product: 'Mouse', quantity: 2 }
      ],
      tags: ['rush', 'vip']
    }
  ]
}

describe('JSON', () => {
  it('reports a syntax error with a line', () => {
    const result = parseJson('{\n"a": }')
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0].line).toBeGreaterThan(1)
  })

  it('warns on duplicate keys and formats', () => {
    const result = parseJson('{"a":1,"a":2}')
    expect(result.ok).toBe(true)
    expect(result.diagnostics.some((item) => item.message.includes('Duplicate'))).toBe(true)
    expect(formatJson('{"b":1}')).toBe('{\n  "b": 1\n}')
  })

  it('parses JSONL and edits the tree without losing siblings', () => {
    const parsed = parseStructuredText('{"n":1}\n{"n":2}\n', 'rows.jsonl')
    expect(parsed.format).toBe('jsonl')
    expect(parsed.value).toEqual([{ n: 1 }, { n: 2 }])
    const tree = valueToTree({ a: 1, b: { c: true } })
    const child = tree.children[1]
    child.children[0].value = 'false'
    child.children[0].type = 'boolean'
    expect(treeToValue(tree)).toEqual({ a: 1, b: { c: false } })
  })
})

describe('XML', () => {
  it('rejects entities and external identifiers', () => {
    const entity = parseXml('<!DOCTYPE foo [<!ENTITY x "y">]><foo>&x;</foo>')
    expect(entity.ok).toBe(false)
    const external = parseXml('<!DOCTYPE foo SYSTEM "file:///secret"><foo/>')
    expect(external.ok).toBe(false)
  })

  it('keeps comments and cdata through a format round-trip', () => {
    const xml = `<?xml version="1.0"?><root><!--note--><![CDATA[a<b]]>tail</root>`
    const formatted = formatXml(xml, 2)
    const parsed = parseXml(formatted)
    expect(parsed.ok).toBe(true)
    expect(formatted).toContain('note')
    expect(formatted).toContain('CDATA')
  })

  it('converts between XML and JSON and warns about the model', () => {
    const xml = `<wrap xmlns:a="urn:a"><a:item id="1">Hi</a:item><a:item id="2">Yo</a:item></wrap>`
    const json = xmlToJson(xml)
    expect(json.warnings.length).toBeGreaterThan(0)
    expect(json.json).toContain('Hi')
    const back = jsonToXml('{"note":{"@_id":"7","#text":"Ada"}}')
    expect(back.xml).toContain('Ada')
    const path = queryXPath(xml, "string(//*[local-name()='item'][1])")
    expect(path.ok).toBe(true)
    expect(path.values.join('')).toContain('Hi')
  })

  it('reports malformed XML', () => {
    expect(parseXml('<root>').ok).toBe(false)
  })
})

describe('mapping', () => {
  it('expands one array and serializes the other', async () => {
    expect(arrayKeys(orders, '$.orders')).toEqual(['items', 'tags'])
    const mapping = suggestMapping(orders, '$.orders', 'items')
    mapping.columns = [
      { sourcePath: 'id', outputColumn: 'Order ID', dataType: 'string', defaultValue: '', include: true },
      { sourcePath: 'customer', outputColumn: 'Customer', dataType: 'string', defaultValue: '', include: true },
      { sourcePath: 'items.product', outputColumn: 'Product', dataType: 'string', defaultValue: '', include: true },
      { sourcePath: 'items.quantity', outputColumn: 'Quantity', dataType: 'number', defaultValue: '', include: true },
      { sourcePath: 'tags', outputColumn: 'Tags', dataType: 'string', defaultValue: '', include: true }
    ]
    const table = applyMapping(orders, mapping)
    expect(table.rows).toEqual([
      ['O001', 'John', 'Laptop', '1', '["rush","vip"]'],
      ['O001', 'John', 'Mouse', '2', '["rush","vip"]']
    ])
    expect(getPath(orders, '$.orders[0].customer')).toBe('John')
    const bytes = await rowsToXlsx(table.headers, table.rows, 'Orders')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(bytes) as never)
    expect(workbook.getWorksheet('Orders')?.getCell('C2').value).toBe('Laptop')
    expect(queryJsonPath(orders, '$.orders[*].id')).toEqual(['O001'])
    expect(() => queryJsonPath(orders, "$..[?(@.constructor.constructor('return 1')())]")).toThrow(/blocked/i)
    const edited = writeMappedCell(orders, mapping, 1, 3, '9') as typeof orders
    expect(edited.orders[0].items[1].quantity).toBe(9)
    expect(edited.orders[0].items[0].quantity).toBe(1)
    const templates = upsertTemplate([], 'Orders', mapping)
    expect(templates[0].name).toBe('Orders')
    expect(upsertTemplate(templates, 'Orders', mapping)).toHaveLength(1)
    const csv = structuredTextToCsv(JSON.stringify(orders), { recordPath: '$.orders', expandPath: 'items', bom: false })
    expect(csv.rowCount).toBe(2)
    expect(csv.csv).toContain('Laptop')
    expect(csv.csv).not.toContain('Mouse,Laptop')
  })

  it('adds, renames, and deletes tree nodes', () => {
    const tree = valueToTree({ customer: 'Ada' })
    const withCity = addChild(tree, tree.id, 'city', 'London')
    expect(treeToValue(withCity)).toEqual({ customer: 'Ada', city: 'London' })
    const city = withCity.children.find((node) => node.key === 'city')
    expect(city).toBeTruthy()
    const renamed = renameKey(withCity, city!.id, 'town')
    expect(treeToValue(renamed)).toEqual({ customer: 'Ada', town: 'London' })
    const removed = removeNode(renamed, city!.id)
    expect(treeToValue(removed)).toEqual({ customer: 'Ada' })
    expect(() => removeNode(tree, tree.id)).toThrow(/root/i)
  })
})
