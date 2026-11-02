const handlers = new Map<string, Set<() => boolean>>()

export function registerCommand(name: string, handler: () => boolean): () => void {
  const set = handlers.get(name) ?? new Set()
  set.add(handler)
  handlers.set(name, set)
  return () => {
    set.delete(handler)
  }
}

export function runCommand(name: string): boolean {
  const set = handlers.get(name)
  if (!set) return false
  for (const handler of set) {
    if (handler()) return true
  }
  return false
}
