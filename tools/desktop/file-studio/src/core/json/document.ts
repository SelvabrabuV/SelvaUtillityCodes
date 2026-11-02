import type { Diagnostic } from '@shared/types'
import { JSON_DEPTH_LIMIT, maxJsonDepth } from '../security/xml-guard'

export interface JsonParseResult {
  ok: boolean
  format: 'json' | 'jsonl'
  value?: unknown
  diagnostics: Diagnostic[]
}

export function parseStructuredText(text: string, fileName = ''): JsonParseResult {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return parseJsonLines(text)
  const parsed = parseJson(text)
  if (parsed.ok) return parsed
  const lines = parseJsonLines(text, true)
  return lines.ok ? lines : parsed
}

export function parseJson(text: string): JsonParseResult {
  try {
    const value = JSON.parse(text) as unknown
    if (maxJsonDepth(value) > JSON_DEPTH_LIMIT) {
      return {
        ok: false,
        format: 'json',
        diagnostics: [
          {
            severity: 'error',
            message: `JSON nesting is over the limit of ${JSON_DEPTH_LIMIT}.`,
            line: 1,
            column: 1
          }
        ]
      }
    }
    return { ok: true, format: 'json', value, diagnostics: duplicateKeyWarnings(text) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    const position = positionFromMessage(message, text)
    const loc = lineColumn(text, position)
    return { ok: false, format: 'json', diagnostics: [{ severity: 'error', message, ...loc }] }
  }
}

export function formatJson(text: string, indent = 2): string {
  const parsed = parseJson(text)
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid JSON')
  return JSON.stringify(parsed.value, null, indent)
}

export function minifyJson(text: string): string {
  return formatJson(text, 0)
}

export function parseJsonLines(text: string, requireMultiple = false): JsonParseResult {
  const lines = text.split(/\r?\n/)
  const values: unknown[] = []
  const diagnostics: Diagnostic[] = []
  let contentLines = 0
  lines.forEach((line, index) => {
    if (!line.trim()) return
    contentLines += 1
    try {
      values.push(JSON.parse(line) as unknown)
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Invalid JSONL line',
        line: index + 1,
        column: 1
      })
    }
  })
  if (requireMultiple && contentLines < 2) {
    return { ok: false, format: 'jsonl', diagnostics: [{ severity: 'error', message: 'Not JSONL', line: 1, column: 1 }] }
  }
  if (diagnostics.length > 0) return { ok: false, format: 'jsonl', diagnostics }
  return { ok: true, format: 'jsonl', value: values, diagnostics: [] }
}

export interface TreeNode {
  id: string
  key: string | null
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  value?: string
  path: string
  children: TreeNode[]
}

export function valueToTree(value: unknown, key: string | null = null, path = '$'): TreeNode {
  const id = path
  if (Array.isArray(value)) {
    return {
      id,
      key,
      type: 'array',
      path,
      children: value.map((item, index) => valueToTree(item, String(index), `${path}[${index}]`))
    }
  }
  if (value && typeof value === 'object') {
    return {
      id,
      key,
      type: 'object',
      path,
      children: Object.entries(value as Record<string, unknown>).map(([childKey, child]) =>
        valueToTree(child, childKey, path === '$' ? `$.${childKey}` : `${path}.${childKey}`)
      )
    }
  }
  if (value === null) return { id, key, type: 'null', path, children: [] }
  return { id, key, type: typeof value as 'string' | 'number' | 'boolean', value: String(value), path, children: [] }
}

export function treeToValue(node: TreeNode): unknown {
  if (node.type === 'object') {
    const result: Record<string, unknown> = {}
    for (const child of node.children) {
      if (child.key != null) result[child.key] = treeToValue(child)
    }
    return result
  }
  if (node.type === 'array') return node.children.map((child) => treeToValue(child))
  if (node.type === 'null') return null
  if (node.type === 'number') return Number(node.value)
  if (node.type === 'boolean') return node.value === 'true'
  return node.value ?? ''
}

export function updateTree(root: TreeNode, id: string, recipe: (node: TreeNode) => TreeNode): TreeNode {
  return mapTree(structuredClone(root), id, recipe)
}

function mapTree(node: TreeNode, id: string, recipe: (node: TreeNode) => TreeNode): TreeNode {
  if (node.id === id) return recipe(node)
  node.children = node.children.map((child) => mapTree(child, id, recipe))
  return node
}

function duplicateKeyWarnings(text: string): Diagnostic[] {
  const warnings: Diagnostic[] = []
  try {
    scanDuplicates(text, warnings)
  } catch {
    return warnings
  }
  return warnings
}

function scanDuplicates(text: string, warnings: Diagnostic[]): void {
  let index = 0
  const skipSpace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1
  }
  const parseValue = () => {
    skipSpace()
    const char = text[index]
    if (char === '{') return parseObject()
    if (char === '[') return parseArray()
    if (char === '"') return parseString()
    if (text.startsWith('true', index) || text.startsWith('false', index) || text.startsWith('null', index)) {
      index += char === 't' ? 4 : char === 'f' ? 5 : 4
      return
    }
    while (index < text.length && !',}]'.includes(text[index]) && !/\s/.test(text[index])) index += 1
  }
  const parseArray = () => {
    index += 1
    skipSpace()
    if (text[index] === ']') {
      index += 1
      return
    }
    while (index < text.length) {
      parseValue()
      skipSpace()
      if (text[index] === ',') {
        index += 1
        continue
      }
      if (text[index] === ']') {
        index += 1
        return
      }
      break
    }
  }
  const parseObject = () => {
    index += 1
    const seen = new Set<string>()
    skipSpace()
    if (text[index] === '}') {
      index += 1
      return
    }
    while (index < text.length) {
      skipSpace()
      const start = index
      const key = parseString()
      if (seen.has(key)) {
        const loc = lineColumn(text, start)
        warnings.push({ severity: 'warning', message: `Duplicate key "${key}". JSON keeps the last value.`, ...loc })
      }
      seen.add(key)
      skipSpace()
      if (text[index] === ':') index += 1
      parseValue()
      skipSpace()
      if (text[index] === ',') {
        index += 1
        continue
      }
      if (text[index] === '}') {
        index += 1
        return
      }
      break
    }
  }
  const parseString = (): string => {
    if (text[index] !== '"') return ''
    index += 1
    let value = ''
    while (index < text.length) {
      const char = text[index]
      if (char === '\\') {
        value += text[index + 1] ?? ''
        index += 2
        continue
      }
      if (char === '"') {
        index += 1
        return value
      }
      value += char
      index += 1
    }
    return value
  }
  parseValue()
}

function positionFromMessage(message: string, text: string): number {
  const match = /position (\d+)/i.exec(message)
  if (match) return Number(match[1])
  return jsonErrorIndex(text)
}

function jsonErrorIndex(text: string): number {
  let index = 0
  const fail = (): never => {
    throw new Error(String(index))
  }
  const skip = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1
  }
  const parseString = () => {
    if (text[index] !== '"') fail()
    index += 1
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2
        continue
      }
      if (text[index] === '"') {
        index += 1
        return
      }
      index += 1
    }
    fail()
  }
  const parseValue = (): void => {
    skip()
    const char = text[index]
    if (char === '{') return parseObject()
    if (char === '[') return parseArray()
    if (char === '"') return parseString()
    if (text.startsWith('true', index)) {
      index += 4
      return
    }
    if (text.startsWith('false', index)) {
      index += 5
      return
    }
    if (text.startsWith('null', index)) {
      index += 4
      return
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      index += 1
      while (index < text.length && /[0-9.eE+-]/.test(text[index])) index += 1
      return
    }
    fail()
  }
  const parseObject = () => {
    index += 1
    skip()
    if (text[index] === '}') {
      index += 1
      return
    }
    while (index < text.length) {
      skip()
      parseString()
      skip()
      if (text[index] !== ':') fail()
      index += 1
      parseValue()
      skip()
      if (text[index] === ',') {
        index += 1
        continue
      }
      if (text[index] === '}') {
        index += 1
        return
      }
      fail()
    }
    fail()
  }
  const parseArray = () => {
    index += 1
    skip()
    if (text[index] === ']') {
      index += 1
      return
    }
    while (index < text.length) {
      parseValue()
      skip()
      if (text[index] === ',') {
        index += 1
        continue
      }
      if (text[index] === ']') {
        index += 1
        return
      }
      fail()
    }
    fail()
  }
  try {
    parseValue()
    return index
  } catch (error) {
    return Number(error instanceof Error ? error.message : 0) || 0
  }
}

function lineColumn(text: string, index: number): { line: number; column: number } {
  let line = 1
  let column = 1
  const capped = Math.min(index, text.length)
  for (let i = 0; i < capped; i += 1) {
    if (text[i] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}
