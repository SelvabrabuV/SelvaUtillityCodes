export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface PreviewResult {
  summary: string
  detail: unknown
}

export interface JobContext {
  signal?: AbortSignal
  onProgress?: (ratio: number, label: string) => void
}

export interface Converter<Input, Output, Options> {
  id: string
  validate(input: Input): Promise<ValidationResult>
  preview(input: Input, options: Options): Promise<PreviewResult>
  convert(input: Input, options: Options, context?: JobContext): Promise<Output>
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Cancelled')
}
