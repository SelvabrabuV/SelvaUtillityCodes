export class FileStudioError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
    this.name = 'FileStudioError'
  }
}

export class EncryptedPdfError extends FileStudioError {
  constructor(message: string) {
    super(message, 'pdf-encrypted')
    this.name = 'EncryptedPdfError'
  }
}

export class UnsafeInputError extends FileStudioError {
  constructor(message: string) {
    super(message, 'unsafe-input')
    this.name = 'UnsafeInputError'
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
