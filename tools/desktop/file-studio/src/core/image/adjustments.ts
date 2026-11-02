export interface ImageAdjustments {
  brightness: number
  saturation: number
  contrast: number
  blur: number
  sharpen: number
  grayscale: boolean
}

export interface ImageRenderOptions {
  rotate?: number
  flipHorizontal?: boolean
  flipVertical?: boolean
  crop?: { left: number; top: number; width: number; height: number }
  resize?: { width?: number; height?: number }
  adjustments?: ImageAdjustments
  format: 'png' | 'jpeg' | 'webp' | 'tiff' | 'bmp' | 'gif'
  quality?: number
  background?: string
  keepMetadata?: boolean
}

export const neutralAdjustments: ImageAdjustments = {
  brightness: 1,
  saturation: 1,
  contrast: 1,
  blur: 0,
  sharpen: 0,
  grayscale: false
}

export function clampCrop(
  imageWidth: number,
  imageHeight: number,
  crop: { left: number; top: number; width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const width = Math.max(1, Math.floor(imageWidth))
  const height = Math.max(1, Math.floor(imageHeight))
  const left = Math.min(width - 1, Math.max(0, Math.floor(crop.left)))
  const top = Math.min(height - 1, Math.max(0, Math.floor(crop.top)))
  return {
    left,
    top,
    width: Math.min(width - left, Math.max(1, Math.floor(crop.width))),
    height: Math.min(height - top, Math.max(1, Math.floor(crop.height)))
  }
}
