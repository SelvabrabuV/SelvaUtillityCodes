import { Canvas, FabricImage, IText, Line, PencilBrush, Rect, Triangle } from 'fabric'
import { useEffect, useRef, useState } from 'react'
import { neutralAdjustments, type ImageRenderOptions } from '@core/image/adjustments'
import type { OcrWord } from '@core/image/ocr'
import { Button } from '@renderer/components/ui'
import { asBytes, base64ToBytes, bytesToBase64 } from '@renderer/lib/bytes'
import { exportBytes } from '@renderer/lib/session'
import { activeTab, useWorkspace } from '@renderer/stores/workspace'
import { toast } from 'sonner'

export function ImagePage() {
  const tab = useWorkspace(activeTab)
  const updateTab = useWorkspace((state) => state.updateTab)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const historyRef = useRef<string[]>([])
  const [words, setWords] = useState<OcrWord[]>([])
  const [preview, setPreview] = useState<string>('')

  useEffect(() => {
    if (!canvasRef.current || !tab?.project) return
    const canvas = new Canvas(canvasRef.current, {
      width: tab.project.canvas.width,
      height: tab.project.canvas.height,
      backgroundColor: tab.project.canvas.background
    })
    fabricRef.current = canvas
    const source = tab.project.source
    if (source) {
      void FabricImage.fromURL(`data:${source.mime};base64,${source.dataBase64}`).then((image) => {
        image.scaleToWidth(tab.project?.canvas.width ?? image.width)
        canvas.add(image)
        canvas.sendObjectToBack(image)
        canvas.requestRenderAll()
      })
    }
    return () => {
      void canvas.dispose()
      fabricRef.current = null
    }
    // The drawing surface is tied to the open tab. Later project updates must not rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id])

  if (!tab || tab.module !== 'image' || !tab.project) {
    return <p className="p-8">Open a PNG, JPEG, WebP, BMP, TIFF, or GIF. Animated GIFs are opened as the first frame.</p>
  }

  const project = tab.project
  const sourceBytes = () => (project.source ? base64ToBytes(project.source.dataBase64) : new Uint8Array())

  return (
    <div className="grid h-full grid-cols-[1fr_280px] grid-rows-[auto_1fr]">
      <div className="col-span-2 flex flex-wrap gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <Button onClick={() => setDraw('pen')}>Pen</Button>
        <Button onClick={() => setDraw('eraser')}>Eraser</Button>
        <Button onClick={() => setDraw('select')}>Select</Button>
        <Button onClick={() => addText()}>Text</Button>
        <Button onClick={() => addShape()}>Rectangle</Button>
        <Button onClick={() => addArrow()}>Arrow</Button>
        <Button onClick={() => void adjust({ rotate: 90 })}>Rotate</Button>
        <Button onClick={() => void adjust({ flipHorizontal: true })}>Flip</Button>
        <Button
          onClick={() =>
            updateTab(tab.id, {
              dirty: true,
              project: { ...project, adjustments: { ...project.adjustments, grayscale: !project.adjustments.grayscale } }
            })
          }
        >
          Grayscale
        </Button>
        <Button onClick={() => void runPreview()}>Preview</Button>
        <Button tone="solid" onClick={() => void exportImage()}>
          Export
        </Button>
        <Button onClick={() => void runOcr()}>Detect text</Button>
        <Button
          onClick={() => {
            const canvas = fabricRef.current
            const previous = historyRef.current.pop()
            if (!canvas || !previous) return
            void canvas.loadFromJSON(JSON.parse(previous) as object).then(() => canvas.requestRenderAll())
          }}
        >
          Undo
        </Button>
      </div>
      <div className="studio-scroll overflow-auto bg-[#d9d3c7] p-6 dark:bg-[#111]">
        <canvas ref={canvasRef} />
        {preview && <img alt="Export preview" className="mt-4 max-w-full border bg-white" src={preview} />}
      </div>
      <aside className="studio-scroll overflow-auto border-l border-[var(--color-line)] p-3 text-sm">
        <h2 className="font-semibold">Layers and OCR</h2>
        <p className="mt-2 text-xs text-black/60">Detected words are OCR guesses. The original font is not recovered from pixels.</p>
        <ul className="mt-3 space-y-2">
          {project.layers.map((layer) => (
            <li key={layer.id}>
              {layer.name} · {layer.type}
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-2">
          {words.map((word) => (
            <li key={`${word.text}-${word.bbox.x0}`}>
              <button
                className="text-left"
                onClick={() =>
                  void replaceWord(word)
                }
              >
                {word.text} ({Math.round(word.confidence)}%)
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs">Brightness {project.adjustments.brightness.toFixed(2)}. Edits stay in the project until you export.</p>
      </aside>
    </div>
  )

  function setDraw(mode: 'pen' | 'eraser' | 'select'): void {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.off('path:created')
    if (mode === 'select') {
      canvas.isDrawingMode = false
      return
    }
    snapshot()
    canvas.isDrawingMode = true
    const brush = new PencilBrush(canvas)
    brush.width = mode === 'eraser' ? 22 : 3
    brush.color = '#102226'
    canvas.freeDrawingBrush = brush
    if (mode === 'eraser') {
      canvas.on('path:created', (event) => {
        const path = (event as { path?: { globalCompositeOperation: string } }).path
        if (!path) return
        path.globalCompositeOperation = 'destination-out'
        canvas.requestRenderAll()
      })
    }
    rememberLayer('annotation', mode === 'eraser' ? 'Eraser' : 'Pen')
  }

  function snapshot(): void {
    const canvas = fabricRef.current
    if (!canvas) return
    historyRef.current.push(JSON.stringify(canvas.toJSON()))
  }

  function addText(): void {
    const canvas = fabricRef.current
    if (!canvas) return
    snapshot()
    const text = new IText('Label', { left: 40, top: 40, fill: '#102226', fontFamily: 'Segoe UI', fontSize: 28 })
    canvas.add(text)
    rememberLayer('text', 'Text')
  }

  function addShape(): void {
    const canvas = fabricRef.current
    if (!canvas) return
    snapshot()
    canvas.add(new Rect({ left: 60, top: 80, width: 120, height: 70, fill: 'transparent', stroke: '#0f6e6b', strokeWidth: 3 }))
    rememberLayer('shape', 'Rectangle')
  }

  function addArrow(): void {
    const canvas = fabricRef.current
    if (!canvas) return
    snapshot()
    canvas.add(new Line([20, 160, 160, 160], { stroke: '#9a3412', strokeWidth: 3 }))
    canvas.add(new Triangle({ left: 150, top: 148, width: 16, height: 16, fill: '#9a3412', angle: 90 }))
    rememberLayer('annotation', 'Arrow')
  }

  function rememberLayer(type: 'text' | 'shape' | 'annotation', name: string): void {
    updateTab(tab!.id, {
      dirty: true,
      project: {
        ...project,
        layers: [...project.layers, { id: `${type}-${Date.now()}`, type, name, visible: true, locked: false, fabric: {} }]
      }
    })
  }

  async function adjust(options: Partial<ImageRenderOptions>): Promise<void> {
    const rendered = (await window.studio.runJob('image-render', {
      bytes: sourceBytes(),
      options: { format: 'png', adjustments: project.adjustments, ...options }
    })) as { bytes: Uint8Array; warning?: string }
    const bytes = asBytes(rendered.bytes)
    updateTab(tab!.id, {
      dirty: true,
      validation: rendered.warning ?? 'Adjusted a working copy',
      project: { ...project, source: { mime: 'image/png', dataBase64: bytesToBase64(bytes) } }
    })
    toast.message('The original file was not overwritten. Export when you want a new file.')
  }

  async function runPreview(): Promise<void> {
    const rendered = (await window.studio.runJob('image-render', {
      bytes: sourceBytes(),
      options: { format: project.exportPrefs.format, quality: project.exportPrefs.quality, adjustments: project.adjustments ?? neutralAdjustments }
    })) as { bytes: Uint8Array; warning?: string }
    const bytes = asBytes(rendered.bytes)
    setPreview(URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: `image/${project.exportPrefs.format}` })))
    if (rendered.warning) toast.message(rendered.warning)
  }

  async function exportImage(): Promise<void> {
    const rendered = (await window.studio.runJob('image-render', {
      bytes: sourceBytes(),
      options: { format: project.exportPrefs.format, quality: project.exportPrefs.quality, adjustments: project.adjustments }
    })) as { bytes: Uint8Array; warning?: string }
    await exportBytes(`image.${project.exportPrefs.format === 'jpeg' ? 'jpg' : project.exportPrefs.format}`, asBytes(rendered.bytes))
  }

  async function runOcr(): Promise<void> {
    const png = (await window.studio.runJob('image-render', { bytes: sourceBytes(), options: { format: 'png', adjustments: neutralAdjustments } })) as {
      bytes: Uint8Array
    }
    const found = (await window.studio.runJob('image-ocr', { bytes: asBytes(png.bytes) })) as OcrWord[]
    setWords(found)
  }

  async function replaceWord(word: OcrWord): Promise<void> {
    const next = window.prompt('Replacement text. The font is a manual choice, not the original.', word.text)
    if (!next) return
    const bytes = asBytes(
      await window.studio.runJob('image-replace', {
        bytes: sourceBytes(),
        region: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: Math.max(8, word.bbox.x1 - word.bbox.x0),
          height: Math.max(8, word.bbox.y1 - word.bbox.y0)
        },
        style: { text: next, fontSize: Math.max(12, word.bbox.y1 - word.bbox.y0), color: '#111111', background: '#ffffff' }
      })
    )
    updateTab(tab!.id, { dirty: true, project: { ...project, source: { mime: 'image/png', dataBase64: bytesToBase64(bytes) } } })
  }
}
