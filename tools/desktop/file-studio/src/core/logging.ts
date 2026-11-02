const BLOCKED = new Set(['content', 'text', 'bytes', 'password', 'html', 'xml', 'source'])

export function logInfo(message: string, meta?: Record<string, string | number | boolean>): void {
  if (meta) {
    for (const key of Object.keys(meta)) {
      if (BLOCKED.has(key.toLowerCase())) throw new Error(`Refusing to log sensitive field "${key}".`)
    }
  }
  console.info(`[file-studio] ${message}`, meta ?? '')
}
