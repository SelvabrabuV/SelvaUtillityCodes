import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveOutputPath } from '../../src/core/batch/paths'

describe('batch output paths', () => {
  it('numbers, renames, skips, and overwrites collisions inside the folder', () => {
    const directory = mkdtempSync(join(tmpdir(), 'file-studio-'))
    writeFileSync(join(directory, 'report.xlsx'), 'x')
    expect(resolveOutputPath(directory, 'fresh.xlsx', existsSync, 'number')).toBe(join(directory, 'fresh.xlsx'))
    expect(resolveOutputPath(directory, 'report.xlsx', existsSync, 'number')).toBe(join(directory, 'report-1.xlsx'))
    expect(resolveOutputPath(directory, 'report.xlsx', existsSync, 'rename')).toBe(join(directory, 'report (1).xlsx'))
    expect(resolveOutputPath(directory, 'report.xlsx', existsSync, 'skip')).toBeNull()
    expect(resolveOutputPath(directory, 'report.xlsx', existsSync, 'overwrite')).toBe(join(directory, 'report.xlsx'))
    expect(resolveOutputPath(directory, '..\\outside.xlsx', existsSync, 'overwrite')).toBe(join(directory, 'outside.xlsx'))
  })
})
