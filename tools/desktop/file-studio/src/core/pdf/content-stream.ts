export interface RewriteResult {
  content: string
  changed: boolean
  supported: boolean
  drawsImage: boolean
}

interface Piece {
  raw: string
  kind: 'lit' | 'hex' | 'op' | 'other'
  value?: string
}

export function pageDrawsImages(content: string): boolean {
  return /\/[^\s[\]()<>]+[ \t\r\n]+Do\b/.test(content)
}

export function rewriteTextShows(content: string, needle: string, replacement: string | null): RewriteResult {
  const drawsImage = pageDrawsImages(content)
  if (!needle) return { content, changed: false, supported: false, drawsImage }
  const pieces = tokenize(content)
  let changed = false
  let supported = false
  for (let index = 0; index < pieces.length; index += 1) {
    const op = pieces[index]
    if (op.kind !== 'op') continue
    if (op.raw === 'Tj') {
      const operand = previousText(pieces, index)
      if (!operand?.value?.includes(needle)) continue
      const next = operand.value.split(needle).join(replacement ?? '')
      operand.raw = operand.kind === 'hex' ? encodeHex(next) : encodeLiteral(next)
      operand.value = next
      changed = true
      supported = true
    }
    if (op.raw === 'TJ') {
      const group = arrayPieces(pieces, index)
      if (group.length === 0) continue
      const combined = group.map((piece) => piece.value ?? '').join('')
      if (!combined.includes(needle)) continue
      const single = group.find((piece) => piece.value?.includes(needle))
      if (single?.value) {
        const next = single.value.split(needle).join(replacement ?? '')
        single.raw = single.kind === 'hex' ? encodeHex(next) : encodeLiteral(next)
        single.value = next
        changed = true
        supported = true
        continue
      }
      if (replacement !== null) {
        return { content, changed: false, supported: false, drawsImage }
      }
      blankOverlapping(group, needle)
      changed = true
      supported = true
    }
  }
  if (!changed) return { content, changed: false, supported: false, drawsImage }
  return { content: pieces.map((piece) => piece.raw).join(''), changed, supported, drawsImage }
}

function previousText(pieces: Piece[], index: number): Piece | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (pieces[cursor].kind === 'lit' || pieces[cursor].kind === 'hex') return pieces[cursor]
    if (pieces[cursor].raw.trim() !== '') return null
  }
  return null
}

function arrayPieces(pieces: Piece[], operatorIndex: number): Piece[] {
  let end = -1
  for (let cursor = operatorIndex - 1; cursor >= 0; cursor -= 1) {
    if (pieces[cursor].raw.trim() === ']') {
      end = cursor
      break
    }
    if (pieces[cursor].raw.trim() !== '') return []
  }
  if (end < 0) return []
  let depth = 0
  let start = -1
  for (let cursor = end; cursor >= 0; cursor -= 1) {
    if (pieces[cursor].raw.trim() === ']') depth += 1
    if (pieces[cursor].raw.trim() === '[') {
      depth -= 1
      if (depth === 0) {
        start = cursor
        break
      }
    }
  }
  if (start < 0) return []
  return pieces.slice(start + 1, end).filter((piece) => piece.kind === 'lit' || piece.kind === 'hex')
}

function blankOverlapping(group: Piece[], needle: string): void {
  const combined = group.map((piece) => piece.value ?? '').join('')
  const at = combined.indexOf(needle)
  if (at < 0) return
  const end = at + needle.length
  let cursor = 0
  for (const piece of group) {
    const value = piece.value ?? ''
    const pieceEnd = cursor + value.length
    if (pieceEnd > at && cursor < end) {
      piece.value = ''
      piece.raw = piece.kind === 'hex' ? '<>' : '()'
    }
    cursor = pieceEnd
  }
}

function tokenize(content: string): Piece[] {
  const pieces: Piece[] = []
  let index = 0
  while (index < content.length) {
    const char = content[index]
    if (char === '(') {
      const parsed = readLiteral(content, index)
      pieces.push({ raw: parsed.raw, kind: 'lit', value: parsed.value })
      index = parsed.end
      continue
    }
    if (char === '<') {
      if (content[index + 1] === '<') {
        pieces.push({ raw: '<<', kind: 'other' })
        index += 2
        continue
      }
      const parsed = readHex(content, index)
      pieces.push({ raw: parsed.raw, kind: 'hex', value: parsed.value })
      index = parsed.end
      continue
    }
    if (/\s/.test(char)) {
      let end = index + 1
      while (end < content.length && /\s/.test(content[end])) end += 1
      pieces.push({ raw: content.slice(index, end), kind: 'other' })
      index = end
      continue
    }
    if ('[]{}'.includes(char)) {
      pieces.push({ raw: char, kind: 'other' })
      index += 1
      continue
    }
    let end = index + 1
    while (end < content.length && !/[\s()<>[\]{}]/.test(content[end])) end += 1
    const raw = content.slice(index, end)
    const kind = /^[A-Za-z'"][A-Za-z0-9'*]*$/.test(raw) && !raw.startsWith('/') ? 'op' : 'other'
    pieces.push({ raw, kind })
    index = end
  }
  return pieces
}

function readLiteral(content: string, start: number): { raw: string; value: string; end: number } {
  let index = start + 1
  let value = ''
  while (index < content.length) {
    const char = content[index]
    if (char === '\\') {
      const next = content[index + 1] ?? ''
      if (/[0-7]/.test(next)) {
        let octal = next
        index += 2
        for (let extra = 0; extra < 2 && /[0-7]/.test(content[index] ?? ''); extra += 1) {
          octal += content[index]
          index += 1
        }
        value += String.fromCharCode(Number.parseInt(octal, 8))
        continue
      }
      const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
      value += map[next] ?? next
      index += 2
      continue
    }
    if (char === ')') return { raw: content.slice(start, index + 1), value, end: index + 1 }
    value += char
    index += 1
  }
  return { raw: content.slice(start), value, end: content.length }
}

function readHex(content: string, start: number): { raw: string; value: string; end: number } {
  const end = content.indexOf('>', start)
  const stop = end === -1 ? content.length : end
  const hex = content.slice(start + 1, stop).replace(/\s+/g, '')
  const padded = hex.length % 2 === 0 ? hex : `${hex}0`
  let value = ''
  for (let index = 0; index < padded.length; index += 2) {
    value += String.fromCharCode(Number.parseInt(padded.slice(index, index + 2), 16))
  }
  return { raw: content.slice(start, stop + 1), value, end: stop + 1 }
}

function encodeLiteral(value: string): string {
  let raw = '('
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char === '(' || char === ')' || char === '\\') raw += `\\${char}`
    else if (char === '\n') raw += '\\n'
    else if (char === '\r') raw += '\\r'
    else if (char === '\t') raw += '\\t'
    else if (code < 32 || code > 126) raw += `\\${code.toString(8).padStart(3, '0')}`
    else raw += char
  }
  return `${raw})`
}

function encodeHex(value: string): string {
  return `<${Array.from(value, (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')}>`
}
