import path from 'node:path'

export function isInsideDir(parent: string, candidate: string): boolean {
  const root = path.resolve(parent)
  const target = path.resolve(candidate)
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
