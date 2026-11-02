import { describe, expect, it } from 'vitest'
import { addInvisibleTextLayer, createBlankPdf, extractPdfText } from '../../src/core/pdf/engine'
import { mapOcrWordsToPage } from '../../src/core/pdf/text-layer'
import { buildRecovery, parseRecovery, recoveryFileName } from '../../src/core/recovery/snapshot'
import { assertFetchableUrl } from '../../src/core/security/urls'

describe('fetchable addresses', () => {
  it('accepts public http and https addresses', () => {
    expect(assertFetchableUrl('https://example.com/tables').hostname).toBe('example.com')
    expect(assertFetchableUrl(' http://example.com/a ').protocol).toBe('http:')
  })

  it('refuses files, passwords, and private hosts', () => {
    expect(() => assertFetchableUrl('file:///C:/page.html')).toThrow(/http/i)
    expect(() => assertFetchableUrl('not a url')).toThrow(/http or https/i)
    expect(() => assertFetchableUrl('http://user:secret@example.com/')).toThrow(/password/i)
    expect(() => assertFetchableUrl('http://localhost/table')).toThrow(/private/i)
    expect(() => assertFetchableUrl('http://127.0.0.1/table')).toThrow(/private/i)
    expect(() => assertFetchableUrl('http://192.168.1.20/table')).toThrow(/private/i)
    expect(() => assertFetchableUrl('http://10.1.2.3/table')).toThrow(/private/i)
    expect(() => assertFetchableUrl('http://[::1]/table')).toThrow(/private/i)
    expect(assertFetchableUrl('http://172.15.0.4/table').hostname).toBe('172.15.0.4')
  })
})

describe('recovery copies', () => {
  it('names a copy without a path and round-trips the document', () => {
    const name = recoveryFileName('..\\report.html', 'tab-abcdef0123456789')
    expect(name.endsWith('.recovery.json')).toBe(true)
    expect(name).not.toMatch(/[\\/]/)
    const raw = buildRecovery({ kind: 'html', title: 'report.html', savedAt: 10, html: '<table></table>' })
    expect(parseRecovery(raw)).toMatchObject({ kind: 'html', title: 'report.html', html: '<table></table>', savedAt: 10 })
  })

  it('rejects an empty or unknown recovery document', () => {
    expect(() => buildRecovery({ kind: 'html', title: ' ', savedAt: 1, html: '<p></p>' })).toThrow(/title/i)
    expect(() => parseRecovery('{"kind":"pdf","title":"a","savedAt":1}')).toThrow(/kind/i)
    expect(() => parseRecovery('{"kind":"html","title":"a","savedAt":1}')).toThrow(/incomplete/i)
  })
})

describe('searchable page text', () => {
  it('maps a top-left image box onto the PDF bottom-left origin', () => {
    const placed = mapOcrWordsToPage(
      [{ text: 'Ada', bbox: { x0: 10, y0: 10, x1: 40, y1: 20 } }],
      { width: 100, height: 100 },
      { width: 200, height: 200 }
    )
    expect(placed).toEqual([{ text: 'Ada', x: 20, y: 160, width: 60, height: 20 }])
    expect(mapOcrWordsToPage([{ text: '  ', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }], { width: 10, height: 10 }, { width: 10, height: 10 })).toEqual([])
    expect(() => mapOcrWordsToPage([], { width: 0, height: 10 }, { width: 10, height: 10 })).toThrow(/positive/i)
  })

  it('writes invisible text that can still be extracted', async () => {
    const blank = await createBlankPdf()
    const next = await addInvisibleTextLayer(blank, 0, [{ text: 'Searchable', x: 72, y: 100, width: 80, height: 14 }])
    const pages = await extractPdfText(next)
    expect(pages[0]?.text).toContain('Searchable')
    await expect(addInvisibleTextLayer(blank, 0, [])).rejects.toThrow(/none of the recognized words/i)
  })
})
