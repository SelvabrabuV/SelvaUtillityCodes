import { UnsafeInputError } from '../errors'

const MAX_DEPTH = 100

export function assertSafeXml(xml: string): void {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  if (/<!DOCTYPE[\s\S]*?<!ENTITY/i.test(withoutComments)) {
    throw new UnsafeInputError('XML entity declarations are blocked.')
  }
  if (/<!DOCTYPE[\s\S]*?\b(?:SYSTEM|PUBLIC)\b/i.test(withoutComments)) {
    throw new UnsafeInputError('External XML identifiers are blocked.')
  }
  const depth = tagDepth(withoutComments)
  if (depth > MAX_DEPTH) {
    throw new UnsafeInputError(`XML nesting is ${depth}, over the limit of ${MAX_DEPTH}.`)
  }
}

function tagDepth(xml: string): number {
  let depth = 0
  let max = 0
  const pattern = /<\/?([A-Za-z_:][\w:.-]*)[^>]*?>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml))) {
    const token = match[0]
    if (token.startsWith('<!') || token.startsWith('<?') || token.startsWith('</')) {
      if (token.startsWith('</')) depth = Math.max(0, depth - 1)
      continue
    }
    if (token.endsWith('/>')) continue
    depth += 1
    max = Math.max(max, depth)
    if (max > MAX_DEPTH) return max
  }
  return max
}

export function maxJsonDepth(value: unknown, depth = 1): number {
  if (depth > MAX_DEPTH + 1) return depth
  if (value === null || typeof value !== 'object') return depth
  let max = depth
  const children = Array.isArray(value) ? value : Object.values(value as object)
  for (const child of children) {
    max = Math.max(max, maxJsonDepth(child, depth + 1))
    if (max > MAX_DEPTH) return max
  }
  return max
}

export const JSON_DEPTH_LIMIT = MAX_DEPTH
