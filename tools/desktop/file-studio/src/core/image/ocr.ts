import { createRequire } from 'node:module'
import path from 'node:path'
import { createWorker, type Word } from 'tesseract.js'

export interface OcrWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

const require = createRequire(import.meta.url)

export async function recognizeImage(png: Buffer): Promise<OcrWord[]> {
  const langPath = languagePath()
  const worker = await createWorker('eng', 1, {
    langPath,
    gzip: true,
    cacheMethod: 'readOnly'
  })
  try {
    const result = await worker.recognize(png)
    const words = (result.data as { words?: Word[] }).words ?? []
    return words
      .filter((word) => word.text.trim().length > 0)
      .map((word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox
      }))
  } finally {
    await worker.terminate()
  }
}

function languagePath(): string {
  const file = require.resolve('@tesseract.js-data/eng/eng.traineddata.gz')
  return path.dirname(file)
}
