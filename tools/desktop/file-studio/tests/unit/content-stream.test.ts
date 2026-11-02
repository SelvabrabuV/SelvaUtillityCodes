import { describe, expect, it } from 'vitest'
import { pageDrawsImages, rewriteTextShows } from '../../src/core/pdf/content-stream'

describe('PDF content streams', () => {
  it('removes a literal string and a split TJ run', () => {
    const literal = rewriteTextShows('BT (SECRET-TOKEN is here) Tj (Public) Tj ET', 'SECRET-TOKEN', null)
    expect(literal.supported).toBe(true)
    expect(literal.content).toContain('( is here)')
    expect(literal.content).toContain('(Public)')
    expect(literal.content).not.toContain('SECRET-TOKEN')
    const split = rewriteTextShows('[(S) -20 (ECRET-TOKEN)] TJ (Keep) Tj', 'SECRET-TOKEN', null)
    expect(split.supported).toBe(true)
    expect(split.content).not.toContain('(S)')
    expect(split.content).not.toContain('ECRET-TOKEN')
    expect(split.content).toContain('(Keep)')
  })

  it('replaces only when the word sits in one string', () => {
    const replaced = rewriteTextShows('(SECRET-TOKEN) Tj', 'SECRET-TOKEN', 'REDACTED')
    expect(replaced.content).toBe('(REDACTED) Tj')
    const split = rewriteTextShows('[(S) (ECRET-TOKEN)] TJ', 'SECRET-TOKEN', 'REDACTED')
    expect(split.supported).toBe(false)
    expect(split.changed).toBe(false)
  })

  it('notices image draws', () => {
    expect(pageDrawsImages('/Im0 Do')).toBe(true)
    expect(pageDrawsImages('(Hello) Tj')).toBe(false)
  })
})