import type { DocKind } from '@shared/types'

export interface Detection {
  kind: DocKind | 'unknown'
  warning?: string
}

const TEXT_EXT = new Set(['.html', '.htm', '.json', '.jsonl', '.ndjson', '.xml', '.csv', '.txt'])

export function detectFile(fileName: string, bytes: Uint8Array): Detection {
  const extension = extensionOf(fileName)
  const magic = magicKind(bytes)
  const textKind = textKindFromSample(fileName, bytes)
  const kind = magic ?? textKind ?? extensionKind(extension) ?? 'unknown'
  const claimed = extensionKind(extension)
  const warning =
    claimed && magic && claimed !== magic
      ? `The extension says ${claimed}, but the contents look like ${magic}.`
      : undefined
  return { kind, warning }
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : ''
}

function extensionKind(extension: string): DocKind | null {
  if (extension === '.fstudio') return 'project'
  if (extension === '.html' || extension === '.htm') return 'html'
  if (extension === '.json' || extension === '.jsonl' || extension === '.ndjson' || extension === '.xml') return 'structured'
  if (extension === '.pdf') return 'pdf'
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'].includes(extension)) return 'image'
  return null
}

function magicKind(bytes: Uint8Array): DocKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image'
  if (startsWith(bytes, [0x42, 0x4d])) return 'image'
  if (
    bytes.length > 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image'
  }
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return 'image'
  }
  return null
}

function textKindFromSample(fileName: string, bytes: Uint8Array): DocKind | null {
  const extension = extensionOf(fileName)
  if (!TEXT_EXT.has(extension) && magicKind(bytes)) return null
  const sample = decodeSample(bytes).trimStart()
  if (!sample) return null
  if (extension === '.fstudio' || sample.includes('"format"') && sample.includes('"fstudio"')) return 'project'
  if (sample.startsWith('{') || sample.startsWith('[')) return 'structured'
  if (sample.startsWith('<?xml') || (sample.startsWith('<') && extension === '.xml')) return 'structured'
  if (/^<!doctype html/i.test(sample) || /^<html[\s>]/i.test(sample) || /<table[\s>]/i.test(sample)) return 'html'
  return null
}

function decodeSample(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 400))
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}
