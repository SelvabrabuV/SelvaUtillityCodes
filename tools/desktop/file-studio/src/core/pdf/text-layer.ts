export interface OcrBox {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface PagePlacement {
  text: string
  x: number
  y: number
  width: number
  height: number
}

/** Map top-left image boxes onto a PDF page whose origin is the bottom left. */
export function mapOcrWordsToPage(
  words: OcrBox[],
  image: { width: number; height: number },
  page: { width: number; height: number }
): PagePlacement[] {
  if (image.width <= 0 || image.height <= 0 || page.width <= 0 || page.height <= 0) {
    throw new Error('The page and image sizes must be positive.')
  }
  const placements: PagePlacement[] = []
  for (const word of words) {
    const text = word.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const width = Math.max(1, ((word.bbox.x1 - word.bbox.x0) / image.width) * page.width)
    const height = Math.max(1, ((word.bbox.y1 - word.bbox.y0) / image.height) * page.height)
    const x = (word.bbox.x0 / image.width) * page.width
    const y = page.height - (word.bbox.y1 / image.height) * page.height
    placements.push({ text, x, y, width, height })
  }
  return placements
}
