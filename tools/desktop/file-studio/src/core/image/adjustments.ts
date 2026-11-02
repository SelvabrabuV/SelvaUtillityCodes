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
