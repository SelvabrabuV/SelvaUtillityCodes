import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { mapOcrWordsToPage, type OcrBox } from '@core/pdf/text-layer'
import { Button } from '@renderer/components/ui'
import { asBytes } from '@renderer/lib/bytes'
import { registerCommand } from '@renderer/lib/commands'
import { exportBytes } from '@renderer/lib/session'
import { activeTab, useWorkspace } from '@renderer/stores/workspace'
import { toast } from 'sonner'

interface PdfText {
  page: number
  text: string
}

const markupRect = { x: 72, y: 680, width: 180, height: 18 }

export function PdfPage() {
  const tab = useWorkspace(activeTab)
  const editTab = useWorkspace((state) => state.editTab)
  const paneRef = useRef<HTMLDivElement>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PdfText[]>([])
  const [fields, setFields] = useState<Array<{ name: string; value: string }>>([])
  const [meta, setMeta] = useState('')
  const [continuous, setContinuous] = useState(false)
  const [ocr, setOcr] = useState<{
    page: number
    bytes: Uint8Array
    words: OcrBox[]
    frame: { image: { width: number; height: number }; page: { width: number; height: number } }
  } | null>(null)
  const [recognizing, setRecognizing] = useState(false)

  const bytes = tab?.module === 'pdf' ? tab.pdfBytes : undefined
  const ocrHere = ocr && bytes && ocr.bytes === bytes && ocr.page === page ? ocr : null

  useEffect(() => {
    if (!bytes) return
    let cancelled = false
    let current: PDFDocumentProxy | null = null
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      const open = (password?: string) =>
        pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, password } as Parameters<typeof pdfjs.getDocument>[0]).promise
      try {
        current = await open()
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name !== 'PasswordException') {
          toast.error(error instanceof Error ? error.message : 'This PDF could not be opened.')
          return
        }
        const password = window.prompt('This PDF is encrypted. Enter the password to view it. Editing still needs an unencrypted copy.')
        if (!password) return
        current = await open(password)
      }
      if (cancelled) {
        await current.destroy()
        return
      }
      setDoc(current)
      setCount(current.numPages)
      setPage((value) => Math.min(value, current?.numPages ?? 1))
    })()
    return () => {
      cancelled = true
      void current?.destroy()
      setDoc(null)
    }
  }, [bytes])

  useEffect(() => {
    if (!bytes) return
    void window.studio.runJob('pdf', { op: 'inspect', bytes }).then((info) => {
      const value = info as { pageCount: number; title?: string; author?: string }
      setMeta([value.title, value.author, `${value.pageCount} pages`].filter(Boolean).join(' · '))
    }).catch(() => setMeta(''))
  }, [bytes])

  useEffect(() => {
    const stopFind = registerCommand('find', () => {
      if (!findRef.current) return false
      findRef.current.focus()
      return true
    })
    const stopExport = registerCommand('export', () => {
      if (!bytes || !tab) return false
      void exportBytes(tab.title.endsWith('.pdf') ? tab.title : 'document.pdf', bytes)
      return true
    })
    return () => {
      stopFind()
      stopExport()
    }
  }, [bytes, tab])

  if (!tab || tab.module !== 'pdf' || !bytes) return <p className="p-8">Open a PDF to view and edit a copy. If parsing fails, the message stays on this page.</p>

  const shown = continuous ? Array.from({ length: Math.min(count, 12) }, (_, index) => index + 1) : [page]

  return (
    <div className="grid h-full grid-cols-[112px_1fr_280px] grid-rows-[auto_1fr]">
      <div className="col-span-3 flex flex-wrap gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <Button onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
        <span className="self-center text-sm">{page} / {count}</span>
        <Button onClick={() => setPage((current) => Math.min(count, current + 1))}>Next</Button>
        <Button onClick={() => setScale((current) => Math.max(0.5, Number((current - 0.2).toFixed(2))))}>Zoom out</Button>
        <Button onClick={() => setScale((current) => Math.min(3, Number((current + 0.2).toFixed(2))))}>Zoom in</Button>
        <Button onClick={() => void fit('width')}>Fit width</Button>
        <Button onClick={() => void fit('page')}>Fit page</Button>
        <Button
          onClick={() => {
            if (count > 12) {
              toast.message('Continuous view is limited to 12 pages. Use the thumbnails to jump.')
              setContinuous(false)
              return
            }
            setContinuous((value) => !value)
          }}
        >
          {continuous ? 'Single page' : 'Continuous'}
        </Button>
        <span className="self-center text-sm">{Math.round(scale * 100)}%</span>
        <Button onClick={() => void mutate('rotate', { delta: 90 })}>Rotate page</Button>
        <Button onClick={() => void mutate('delete', {})}>Delete page</Button>
        <Button onClick={() => void mutate('duplicate', {})}>Duplicate</Button>
        <Button onClick={() => void mutate('blank', { at: page })}>Blank page</Button>
        <Button onClick={() => void movePage(-1)}>Move up</Button>
        <Button onClick={() => void movePage(1)}>Move down</Button>
        <Button onClick={() => void extractPage()}>Extract page</Button>
        <Button onClick={() => void splitAll()}>Split to folder</Button>
        <Button onClick={() => void mergeAnother()}>Merge PDF</Button>
        <Button
          onClick={() => {
            const text = window.prompt('New text to add. This does not replace existing text objects.')
            if (!text) return
            void mutate('text-add', { text, rect: { x: 72, y: 720, width: 240, height: 24 }, size: 16 })
          }}
        >
          Add text
        </Button>
        <Button onClick={() => void mutate('highlight', { rect: markupRect })}>Highlight</Button>
        <Button onClick={() => void mutate('underline', { rect: markupRect })}>Underline</Button>
        <Button onClick={() => void mutate('strike', { rect: markupRect })}>Strike</Button>
        <Button onClick={() => void mutate('note', { contents: 'Note', rect: { x: 72, y: 640, width: 24, height: 24 } })}>Note</Button>
        <Button onClick={() => void mutate('square', { rect: { x: 72, y: 560, width: 120, height: 60 } })}>Rectangle</Button>
        <Button onClick={() => void mutate('circle', { rect: { x: 210, y: 560, width: 80, height: 60 } })}>Circle</Button>
        <Button onClick={() => void mutate('line', { from: { x: 72, y: 540 }, to: { x: 220, y: 540 }, arrow: true })}>Arrow</Button>
        <Button onClick={() => void mutate('ink', { points: [[80, 500], [120, 530], [170, 490]] })}>Ink</Button>
        <Button
          onClick={() => {
            const name = window.prompt('Stamp name: Approved, Draft, or Final', 'Approved')
            if (!name) return
            void mutate('stamp', { name, rect: { x: 360, y: 680, width: 120, height: 40 } })
          }}
        >
          Stamp
        </Button>
        <Button onClick={() => imageRef.current?.click()}>Place image</Button>
        <Button onClick={() => void deleteLastAnnotation()}>Delete annotation</Button>
        <Button onClick={() => void exportPng()}>Page PNG</Button>
        <Button onClick={() => void saveCopy()}>Save copy</Button>
        <input ref={imageRef} className="hidden" type="file" accept="image/png,image/jpeg" onChange={(event) => void placeImage(event.target.files?.[0])} />
      </div>
      <aside className="studio-scroll overflow-auto border-r border-[var(--color-line)] bg-[#efeae0] p-2">
        {Array.from({ length: Math.min(count, 40) }, (_, index) => (
          <button key={index + 1} className={`mb-2 block w-full ${page === index + 1 ? 'ring-2 ring-[var(--color-teal)]' : ''}`} onClick={() => setPage(index + 1)}>
            {doc && <PdfCanvas doc={doc} pageNumber={index + 1} scale={0.14} />}
            <span className="text-xs">{index + 1}</span>
          </button>
        ))}
        {count > 40 && <p className="text-xs">Showing the first 40 thumbnails.</p>}
      </aside>
      <div ref={paneRef} className="studio-scroll overflow-auto bg-[#d7d1c6] p-6">
        {doc ? (
          shown.map((pageNumber) => (
            <div key={pageNumber} className="mb-4">
              <PdfCanvas doc={doc} pageNumber={pageNumber} scale={scale} textLayer />
            </div>
          ))
        ) : (
          <p className="text-sm">Opening the PDF…</p>
        )}
      </div>
      <aside className="studio-scroll space-y-3 overflow-auto border-l border-[var(--color-line)] p-3 text-sm">
        <h2 className="font-semibold">Find, forms, redaction</h2>
        {meta && <p className="text-xs text-black/60">{meta}</p>}
        <input ref={findRef} className="w-full rounded border px-2 py-1" placeholder="Find text" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button onClick={() => void search()}>Search</Button>
        <Button onClick={() => void copyPage()}>Copy page text</Button>
        <h2 className="pt-2 font-semibold">Scanned page</h2>
        <p className="text-xs text-black/60">
          Recognize runs local English OCR on a picture of this page. Make searchable adds an invisible Helvetica text layer. The original font is not recovered.
        </p>
        <Button disabled={!doc || recognizing} onClick={() => void recognizePage()}>
          {recognizing ? 'Recognizing' : 'Recognize page'}
        </Button>
        <Button disabled={!ocrHere || ocrHere.words.length === 0} onClick={() => void makeSearchable()}>
          Make searchable
        </Button>
        {ocrHere && ocrHere.words.length > 0 && <p className="text-xs">{ocrHere.words.length} words recognized on this page.</p>}
        <ul>
          {hits.map((hit) => (
            <li key={`${hit.page}-${hit.text.slice(0, 24)}`}>
              <button onClick={() => setPage(hit.page)}>Page {hit.page}</button>
            </li>
          ))}
        </ul>
        <Button onClick={() => void loadFields()}>Read form fields</Button>
        {fields.map((field) => (
          <label key={field.name} className="block">
            {field.name}
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              defaultValue={field.value}
              onBlur={(event) => void mutate('fill', { values: { [field.name]: event.target.value } })}
            />
          </label>
        ))}
        <Button onClick={() => void mutate('flatten', {})}>Flatten form</Button>
        <Button
          onClick={() => {
            const needle = window.prompt('Text to remove from the content stream')
            if (!needle) return
            void redact(needle)
          }}
        >
          Redact text
        </Button>
        <p className="text-xs text-black/60">
          Redaction runs only when the text operators can be deleted and a check proves the text is gone. A black box is not used. Highlight, underline, strike, notes, shapes, arrows, stamps, and ink are PDF annotation objects. Add text and Place image write new content. They do not rewrite an existing text object. Overlay text covers an area and is labeled as an overlay.
        </p>
        <Button
          onClick={() => {
            const replacement = window.prompt('Overlay text. This covers an area and does not change the original text object.')
            if (!replacement) return
            void mutate('overlay', { text: replacement, rect: { x: 72, y: 600, width: 180, height: 22 }, size: 14 })
          }}
        >
          Overlay text
        </Button>
      </aside>
    </div>
  )

  async function fit(mode: 'width' | 'page'): Promise<void> {
    if (!doc || !paneRef.current) return
    const pdfPage = await doc.getPage(page)
    const viewport = pdfPage.getViewport({ scale: 1 })
    const box = paneRef.current
    const widthScale = (box.clientWidth - 48) / viewport.width
    const heightScale = (box.clientHeight - 48) / viewport.height
    const next = mode === 'width' ? widthScale : Math.min(widthScale, heightScale)
    setScale(Math.max(0.4, Math.min(3, Number(next.toFixed(2)))))
  }

  async function mutate(op: string, extra: Record<string, unknown>): Promise<boolean> {
    try {
      const result = await window.studio.runJob('pdf', { op, bytes, page: page - 1, ...extra })
      const next = asBytes(result && typeof result === 'object' && 'bytes' in (result as object) ? (result as { bytes: unknown }).bytes : result)
      if (next.byteLength > 0) editTab(tab!.id, { pdfBytes: next, dirty: true, validation: op })
      if (result && typeof result === 'object' && 'mode' in (result as object)) {
        toast.message(`Saved as ${(result as { mode: string }).mode}.`)
      }
      return next.byteLength > 0
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF edit failed')
      return false
    }
  }

  async function recognizePage(): Promise<void> {
    if (!doc) return
    const requested = page
    setRecognizing(true)
    try {
      const pdfPage = await doc.getPage(requested)
      const pageBox = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) return
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return
      const found = (await window.studio.runJob('image-ocr', { bytes: new Uint8Array(await blob.arrayBuffer()) })) as OcrBox[]
      if (!bytes) return
      setOcr({
        page: requested,
        bytes,
        words: found,
        frame: {
          image: { width: canvas.width, height: canvas.height },
          page: { width: pageBox.width, height: pageBox.height }
        }
      })
      toast.message(
        found.length
          ? `Recognized ${found.length} words. The font is not recovered.`
          : 'No English words were recognized on this page.'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Page recognition failed')
    } finally {
      setRecognizing(false)
    }
  }

  async function makeSearchable(): Promise<void> {
    if (!ocrHere || ocrHere.words.length === 0) {
      toast.message('Recognize this page before making it searchable.')
      return
    }
    const words = mapOcrWordsToPage(ocrHere.words, ocrHere.frame.image, ocrHere.frame.page)
    if (words.length === 0) {
      toast.message('None of the recognized words could be placed.')
      return
    }
    const wrote = await mutate('ocr-layer', { words })
    if (wrote) toast.message('Added an invisible Helvetica text layer. The original font is not recovered.')
  }

  async function search(): Promise<void> {
    const pages = (await window.studio.runJob('pdf', { op: 'text', bytes })) as PdfText[]
    setHits(pages.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())))
  }

  async function copyPage(): Promise<void> {
    const pages = (await window.studio.runJob('pdf', { op: 'text', bytes })) as PdfText[]
    const text = pages.find((item) => item.page === page)?.text ?? ''
    await navigator.clipboard.writeText(text)
    toast.success(text ? 'Copied the page text' : 'This page has no extracted text')
  }

  async function loadFields(): Promise<void> {
    const result = (await window.studio.runJob('pdf', { op: 'fields', bytes })) as Array<{ name: string; value: string }>
    setFields(result)
  }

  async function redact(needle: string): Promise<void> {
    const plan = (await window.studio.runJob('pdf', { op: 'plan-redact', bytes, page: page - 1, needle })) as { canApply: boolean; reason: string }
    if (!plan.canApply) {
      toast.error(plan.reason)
      return
    }
    const confirmed = await window.studio.confirm(`${plan.reason} Remove "${needle}" from this page?`)
    if (!confirmed) return
    await mutate('redact', { needle })
  }

  async function saveCopy(): Promise<void> {
    await exportBytes(tab!.title.endsWith('.pdf') ? tab!.title : 'document.pdf', bytes!)
  }

  async function extractPage(): Promise<void> {
    const extracted = asBytes(await window.studio.runJob('pdf', { op: 'extract', bytes, indices: [page - 1] }))
    await exportBytes(`page-${page}.pdf`, extracted)
  }

  async function splitAll(): Promise<void> {
    const directory = await window.studio.pickDirectory()
    if (!directory) return
    const parts = (await window.studio.runJob('pdf', { op: 'split', bytes })) as unknown[]
    let first: string | null = null
    for (let index = 0; index < parts.length; index += 1) {
      const target = await window.studio.outputPath(directory, `page-${index + 1}.pdf`, 'number')
      if (!target) continue
      await window.studio.writeFile(target, asBytes(parts[index]), false)
      first ??= target
    }
    toast.success(`Wrote ${parts.length} pages`)
    if (first) await window.studio.showInFolder(first)
  }

  async function mergeAnother(): Promise<void> {
    const files = await window.studio.openFiles()
    if (files.length === 0) return
    await mutate('merge', { others: files.map((file) => asBytes(file.bytes)) })
  }

  async function movePage(direction: -1 | 1): Promise<void> {
    const target = page - 1 + direction
    if (target < 0 || target >= count) return
    await mutate('move', { from: page - 1, to: target })
    setPage(target + 1)
  }

  async function deleteLastAnnotation(): Promise<void> {
    const subtypes = (await window.studio.runJob('pdf', { op: 'annots', bytes, page: page - 1 })) as string[]
    if (subtypes.length === 0) {
      toast.message('This page has no annotations.')
      return
    }
    await mutate('remove-annot', { index: subtypes.length - 1 })
  }

  async function placeImage(file: File | undefined): Promise<void> {
    if (!file) return
    const image = new Uint8Array(await file.arrayBuffer())
    await mutate('image', { image, rect: { x: 72, y: 360, width: 180, height: 120 } })
    toast.message('The image was embedded in the page content. It is not a change to existing text.')
  }

  async function exportPng(): Promise<void> {
    if (!doc) return
    const pdfPage = await doc.getPage(page)
    const viewport = pdfPage.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) return
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    await exportBytes(`page-${page}.png`, new Uint8Array(await blob.arrayBuffer()))
  }
}

function PdfCanvas({ doc, pageNumber, scale, textLayer = false }: { doc: PDFDocumentProxy; pageNumber: number; scale: number; textLayer?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void } | null = null
    void (async () => {
      const pdfPage = await doc.getPage(pageNumber)
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) return
      const task = pdfPage.render({ canvas, canvasContext: context, viewport })
      renderTask = task
      await task.promise
      if (cancelled || !textLayer || !textRef.current) return
      const pdfjs = await import('pdfjs-dist')
      textRef.current.replaceChildren()
      const layer = new pdfjs.TextLayer({
        textContentSource: await pdfPage.getTextContent(),
        container: textRef.current,
        viewport
      })
      await layer.render()
    })().catch(() => undefined)
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, pageNumber, scale, textLayer])

  return (
    <div className="pdf-stage">
      <canvas ref={canvasRef} className="bg-white shadow" />
      {textLayer && <div ref={textRef} className="textLayer" />}
    </div>
  )
}
