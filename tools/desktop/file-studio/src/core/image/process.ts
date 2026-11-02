import sharp from 'sharp'
import { neutralAdjustments, type ImageAdjustments, type ImageRenderOptions } from './adjustments'

export type { ImageAdjustments, ImageRenderOptions }
export { neutralAdjustments }

export const MAX_PIXELS = 40_000_000

export interface ImageInfo {
  width: number
  height: number
  format: string
  hasAlpha: boolean
  pages: number
  orientation?: number
  hasIcc: boolean
  warning?: string
}

export async function readImageInfo(input: Buffer): Promise<ImageInfo> {
  const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS, animated: false, failOn: 'error' }).metadata()
  const pages = metadata.pages ?? 1
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    hasAlpha: Boolean(metadata.hasAlpha),
    pages,
    orientation: metadata.orientation,
    hasIcc: Boolean(metadata.icc),
    warning: pages > 1 ? 'Animated frames are not edited. File Studio uses the first frame.' : undefined
  }
}

export async function renderImage(input: Buffer, options: ImageRenderOptions): Promise<{ bytes: Buffer; warning?: string }> {
  let pipeline = sharp(input, { limitInputPixels: MAX_PIXELS, animated: false, failOn: 'error' }).rotate()
  if (options.rotate) pipeline = pipeline.rotate(options.rotate)
  if (options.flipHorizontal) pipeline = pipeline.flop()
  if (options.flipVertical) pipeline = pipeline.flip()
  if (options.crop) pipeline = pipeline.extract(options.crop)
  if (options.resize?.width || options.resize?.height) {
    pipeline = pipeline.resize({
      width: options.resize.width,
      height: options.resize.height,
      fit: 'fill'
    })
  }
  const adjustments = options.adjustments
  if (adjustments) {
    pipeline = pipeline.modulate({
      brightness: adjustments.brightness,
      saturation: adjustments.grayscale ? 0 : adjustments.saturation
    })
    if (adjustments.contrast !== 1) {
      pipeline = pipeline.linear(adjustments.contrast, 128 * (1 - adjustments.contrast))
    }
    if (adjustments.blur > 0) pipeline = pipeline.blur(adjustments.blur)
    if (adjustments.sharpen > 0) pipeline = pipeline.sharpen({ sigma: adjustments.sharpen })
    if (adjustments.grayscale) pipeline = pipeline.grayscale()
  }
  if (options.background && (options.format === 'jpeg' || options.format === 'bmp')) {
    pipeline = pipeline.flatten({ background: options.background })
  }
  if (options.keepMetadata) pipeline = pipeline.withMetadata()
  const quality = Math.round((options.quality ?? 0.92) * 100)
  if (options.format === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true })
  else if (options.format === 'webp') pipeline = pipeline.webp({ quality })
  else if (options.format === 'tiff') pipeline = pipeline.tiff()
  else if (options.format === 'gif') pipeline = pipeline.gif()
  else if (options.format === 'bmp') pipeline = pipeline.png().toFormat('png')
  else pipeline = pipeline.png()
  const bytes = await pipeline.toBuffer()
  const warnings = [
    options.format === 'jpeg' ? 'JPEG save is lossy. Edit from the project file to avoid recompressing the original.' : '',
    options.format === 'jpeg' || options.format === 'bmp' ? 'This format does not keep transparency.' : '',
    options.format === 'gif' ? 'GIF export is a single frame.' : ''
  ].filter(Boolean)
  return { bytes, warning: warnings.join(' ') || undefined }
}

export async function replaceRegion(
  input: Buffer,
  region: { x: number; y: number; width: number; height: number },
  style: { text: string; fontSize: number; color: string; background: string }
): Promise<Buffer> {
  const patch = await sharp({
    create: {
      width: Math.max(1, region.width),
      height: Math.max(1, region.height),
      channels: 4,
      background: style.background
    }
  })
    .png()
    .toBuffer()
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${region.width}" height="${region.height}"><text x="4" y="${Math.max(style.fontSize, Math.round(region.height * 0.75))}" font-size="${style.fontSize}" fill="${escapeXml(style.color)}" font-family="Arial, sans-serif">${escapeXml(style.text)}</text></svg>`
  )
  const text = await sharp(svg).png().toBuffer()
  const painted = await sharp(patch).composite([{ input: text, left: 0, top: 0 }]).png().toBuffer()
  return sharp(input, { limitInputPixels: MAX_PIXELS, animated: false })
    .composite([{ input: painted, left: region.x, top: region.y }])
    .png()
    .toBuffer()
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char)
}
