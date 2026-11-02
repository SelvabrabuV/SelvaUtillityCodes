import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveOutputPath } from '../../src/core/batch/paths'
import { detectFile } from '../../src/core/detect'
import { logInfo } from '../../src/core/logging'
import { escapeFormulaText, safeFileName } from '../../src/core/security/names'
import { isInsideDir } from '../../src/core/security/paths'

describe('security helpers', () => {
  it('blocks formula prefixes, traversal, and sensitive logs', () => {
    expect(escapeFormulaText('=1+1')).toBe("'=1+1")
    expect(escapeFormulaText('@cmd')).toBe("'@cmd")
    expect(safeFileName('..\\..\\evil?.txt')).not.toContain('..')
    expect(isInsideDir('C:\\work', 'C:\\work\\out.xlsx')).toBe(true)
    expect(isInsideDir('C:\\work', 'C:\\other\\out.xlsx')).toBe(false)
    expect(() => logInfo('open', { password: 'secret' })).toThrow(/sensitive/i)
    logInfo('open', { fileName: 'a.xlsx', size: 12 })
  })

  it('keeps batch outputs inside the destination', () => {
    const existing = new Set<string>()
    const first = resolveOutputPath('C:\\out', 'report.csv', (full) => existing.has(full), 'number')
    expect(first && path.basename(first)).toBe('report.csv')
    existing.add(first!)
    const next = resolveOutputPath('C:\\out', 'report.csv', (full) => existing.has(full), 'rename')
    expect(path.basename(next!)).toBe('report (1).csv')
    expect(resolveOutputPath('C:\\out', 'report.csv', () => true, 'skip')).toBeNull()
  })

  it('detects kind and mismatches', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(detectFile('scan.pdf', pdf).kind).toBe('pdf')
    expect(detectFile('scan.png', pdf).warning).toMatch(/extension/i)
    const html = new TextEncoder().encode('<table><tr><td>A</td></tr></table>')
    expect(detectFile('notes.html', html).kind).toBe('html')
  })
})
