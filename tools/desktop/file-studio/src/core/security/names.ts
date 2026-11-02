const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'untitled'
  const cleaned = base
    // Control characters are illegal in Windows file names.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '')
    .trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'untitled'
  return cleaned.slice(0, 120)
}

export function escapeFormulaText(text: string): string {
  if (FORMULA_PREFIX.test(text)) return `'${text}`
  return text
}

export type ScalarType = 'string' | 'number' | 'boolean' | 'date'

export function classifyScalar(text: string): ScalarType {
  const trimmed = text.trim()
  if (trimmed === '') return 'string'
  if (/^(true|false)$/i.test(trimmed)) return 'boolean'
  if (isPlainNumber(trimmed)) return 'number'
  if (parseUserDate(trimmed)) return 'date'
  return 'string'
}

export function isPlainNumber(text: string): boolean {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())
}

export function parseUserDate(text: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date
    }
    return null
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (us) {
    const month = Number(us[1])
    const day = Number(us[2])
    const year = Number(us[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date
  }
  return null
}

export function excelScalar(text: string, type: ScalarType = classifyScalar(text)): string | number | boolean | Date {
  const trimmed = text.trim()
  if (type === 'number' && isPlainNumber(trimmed)) return Number(trimmed.replace(/,/g, ''))
  if (type === 'boolean' && /^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true'
  if (type === 'date') {
    const date = parseUserDate(trimmed)
    if (date) return date
  }
  return escapeFormulaText(text)
}
