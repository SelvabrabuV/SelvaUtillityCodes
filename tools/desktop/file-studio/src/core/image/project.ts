import { z } from 'zod'
import { neutralAdjustments, type ImageAdjustments } from './adjustments'

const adjustmentsSchema = z.object({
  brightness: z.number(),
  saturation: z.number(),
  contrast: z.number(),
  blur: z.number(),
  sharpen: z.number(),
  grayscale: z.boolean()
})

const layerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['image', 'text', 'shape', 'annotation']),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  fabric: z.record(z.string(), z.unknown())
})

const projectSchema = z.object({
  format: z.literal('fstudio'),
  version: z.literal(1),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    background: z.string()
  }),
  source: z
    .object({
      mime: z.string(),
      dataBase64: z.string()
    })
    .nullable(),
  layers: z.array(layerSchema),
  adjustments: adjustmentsSchema,
  exportPrefs: z.object({
    format: z.enum(['png', 'jpeg', 'webp', 'tiff', 'bmp']),
    quality: z.number().min(0.4).max(1),
    keepMetadata: z.boolean()
  })
})

export interface StudioLayer {
  id: string
  type: 'image' | 'text' | 'shape' | 'annotation'
  name: string
  visible: boolean
  locked: boolean
  fabric: Record<string, unknown>
}

export interface StudioProject {
  format: 'fstudio'
  version: 1
  canvas: { width: number; height: number; background: string }
  source: { mime: string; dataBase64: string } | null
  layers: StudioLayer[]
  adjustments: ImageAdjustments
  exportPrefs: { format: 'png' | 'jpeg' | 'webp' | 'tiff' | 'bmp'; quality: number; keepMetadata: boolean }
}

export function createProject(width: number, height: number, source: StudioProject['source']): StudioProject {
  return {
    format: 'fstudio',
    version: 1,
    canvas: { width, height, background: '#ffffff' },
    source,
    layers: source
      ? [
          {
            id: 'base',
            type: 'image',
            name: 'Image',
            visible: true,
            locked: false,
            fabric: {}
          }
        ]
      : [],
    adjustments: { ...neutralAdjustments },
    exportPrefs: { format: 'png', quality: 0.92, keepMetadata: false }
  }
}

export function parseProject(text: string): StudioProject {
  const value: unknown = JSON.parse(text)
  const parsed = projectSchema.safeParse(value)
  if (!parsed.success) throw new Error('This file is not a File Studio project.')
  return parsed.data
}

export function stringifyProject(project: StudioProject): string {
  return JSON.stringify(projectSchema.parse(project), null, 2)
}
