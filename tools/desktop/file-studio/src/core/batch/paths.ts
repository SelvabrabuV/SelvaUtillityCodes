import path from 'node:path'
import { safeFileName } from '../security/names'
import { isInsideDir } from '../security/paths'

export type CollisionPolicy = 'rename' | 'overwrite' | 'skip' | 'number'

export function resolveOutputPath(
  directory: string,
  fileName: string,
  exists: (fullPath: string) => boolean,
  policy: CollisionPolicy
): string | null {
  const safe = safeFileName(fileName)
  const initial = path.join(directory, safe)
  if (!isInsideDir(directory, initial)) throw new Error('Output path escapes the destination folder.')
  if (!exists(initial)) return initial
  if (policy === 'skip') return null
  if (policy === 'overwrite') return initial
  const extension = path.extname(safe)
  const stem = safe.slice(0, safe.length - extension.length)
  for (let index = 1; index < 1000; index += 1) {
    const candidate =
      policy === 'rename' ? path.join(directory, `${stem} (${index})${extension}`) : path.join(directory, `${stem}-${index}${extension}`)
    if (!isInsideDir(directory, candidate)) throw new Error('Output path escapes the destination folder.')
    if (!exists(candidate)) return candidate
  }
  throw new Error('Could not find a free file name.')
}

export interface BatchPlan {
  inputs: string[]
  destination: string
  policy: CollisionPolicy
}

export function assertBatchDestination(plan: BatchPlan): void {
  for (const input of plan.inputs) {
    if (path.resolve(input) === path.resolve(plan.destination)) {
      throw new Error('The destination cannot be the source file.')
    }
  }
}
