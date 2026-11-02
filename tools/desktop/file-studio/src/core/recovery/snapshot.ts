import { safeFileName } from '../security/names'

export interface RecoveryDocument {
  kind: 'html' | 'structured' | 'project'
  title: string
  savedAt: number
  html?: string
  text?: string
  format?: 'json' | 'xml' | 'jsonl'
  project?: unknown
}

export function recoveryFileName(title: string, id: string): string {
  const stem = safeFileName(title).replace(/\.recovery\.json$/i, '').replace(/\.[^.]+$/, '') || 'untitled'
  const suffix = safeFileName(id).replace(/\.recovery\.json$/i, '').slice(-16) || 'tab'
  return `${stem}-${suffix}.recovery.json`
}

export function buildRecovery(document: RecoveryDocument): string {
  if (!document.title.trim()) throw new Error('A recovery copy needs a title.')
  if (document.kind === 'html' && document.html == null) throw new Error('The HTML recovery copy is empty.')
  if (document.kind === 'structured' && document.text == null) throw new Error('The structured recovery copy is empty.')
  if (document.kind === 'project' && document.project == null) throw new Error('The project recovery copy is empty.')
  return JSON.stringify({ ...document, savedAt: document.savedAt || Date.now() })
}

export function parseRecovery(text: string): RecoveryDocument {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object') throw new Error('This is not a File Studio recovery file.')
  const record = value as Partial<RecoveryDocument>
  if (record.kind !== 'html' && record.kind !== 'structured' && record.kind !== 'project') {
    throw new Error('This recovery file is not a kind File Studio can restore.')
  }
  if (typeof record.title !== 'string' || typeof record.savedAt !== 'number') throw new Error('This recovery file is incomplete.')
  if (record.kind === 'html' && typeof record.html !== 'string') throw new Error('This recovery file is incomplete.')
  if (record.kind === 'structured' && typeof record.text !== 'string') throw new Error('This recovery file is incomplete.')
  if (record.kind === 'project' && (record.project == null || typeof record.project !== 'object')) {
    throw new Error('This recovery file is incomplete.')
  }
  return record as RecoveryDocument
}
