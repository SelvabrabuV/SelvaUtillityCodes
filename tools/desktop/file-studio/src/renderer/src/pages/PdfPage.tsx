import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui'
import { asBytes } from '@renderer/lib/bytes'
import { exportBytes } from '@renderer/lib/session'
import { activeTab, useWorkspace } from '@renderer/stores/workspace'
import { toast } from 'sonner'

interface PdfText {
  page: number
  text: string
}

export function PdfPage() {
  const tab = useWorkspace(activeTab)
  const updateTab = useWorkspace((state) => state.updateTab)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PdfText[]>([])
  const [fields, setFields] = useState<Array<{ name: string; value: string }>>([])

  useEffect(() => {
    const pdfBytes = tab?.pdfBytes
    if (!pdfBytes || !canvasRef.current) return
    let cancelled = false
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
      const open = (password?: string) =>
        pdfjs.getDocument({ data: pdfBytes.slice(), isEvalSupported: false, password } as Parameters<typeof pdfjs.getDocument>[0]).promise
      try {
        document = await open()
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name !== 'PasswordException') throw error
        const password = window.prompt('This PDF is encrypted. Enter the password to view it. Editing still needs an unencrypted copy.')
        if (!password) return
        document = await open(password)
      }
      if (cancelled) return
      setCount(document.numPages)
      const pdfPage = await document.getPage(Math.min(page, document.numPages))
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      if (!context) return
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
    })()
    return () => {
      cancelled = true
    }
  }, [tab?.pdfBytes, tab?.id, page, scale])

  if (!tab || tab.module !== 'pdf' || !tab.pdfBytes) return <p className="p-8">Open a PDF to view and edit a copy.</p>

  const bytes = tab.pdfBytes
  return (
    <div className="grid h-full grid-cols-[1fr_280px] grid-rows-[auto_1fr]">
      <div className="col-span-2 flex flex-wrap gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <Button onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
        <span className="self-center text-sm">
          {page} / {count}
        </span>
        <Button onClick={() => setPage((current) => Math.min(count, current + 1))}>Next</Button>
        <Button onClick={() => setScale((current) => Math.max(0.5, Number((current - 0.2).toFixed(2))))}>Zoom out</Button>
        <Button onClick={() => setScale((current) => Math.min(3, Number((current + 0.2).toFixed(2))))}>Zoom in</Button>
        <span className="self-center text-sm">{Math.round(scale * 100)}%</span>
        <Button onClick={() => void mutate('rotate', { delta: 90 })}>Rotate page</Button>
        <Button onClick={() => void mutate('delete', {})}>Delete page</Button>
        <Button onClick={() => void mutate('duplicate', {})}>Duplicate</Button>
        <Button onClick={() => void mutate('blank', { at: page })}>Blank page</Button>
        <Button
          onClick={() => {
            const text = window.prompt('New text to add. This does not replace existing text objects.')
            if (!text) return
            void mutate('text-add', { text, rect: { x: 72, y: 720, width: 200, height: 24 }, size: 16 })
          }}
        >
          Add text
        </Button>
        <Button onClick={() => void mutate('highlight', { rect: { x: 72, y: 700, width: 180, height: 18 } })}>Highlight</Button>
        <Button onClick={() => void mutate('note', { contents: 'Note', rect: { x: 72, y: 680, width: 24, height: 24 } })}>Note</Button>
        <Button onClick={() => void saveCopy()}>Save copy</Button>
      </div>
      <div className="studio-scroll overflow-auto bg-[#d7d1c6] p-6">
        <canvas ref={canvasRef} className="bg-white shadow" />
      </div>
      <aside className="studio-scroll space-y-3 overflow-auto border-l border-[var(--color-line)] p-3 text-sm">
        <h2 className="font-semibold">Find, forms, redaction</h2>
        <input className="w-full rounded border px-2 py-1" placeholder="Find text" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button onClick={() => void search()}>Search</Button>
        <ul>
          {hits.map((hit) => (
            <li key={hit.page}>
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
          Redaction runs only when the text operators can be deleted and a check proves the text is gone. A black box alone is not used. Existing text that cannot be edited safely is left alone; use Add text for an overlay.
        </p>
        <Button
          onClick={() => {
            const replacement = window.prompt('Overlay text. This covers an area and does not change the original text object.')
            if (!replacement) return
            void mutate('overlay', { text: replacement, rect: { x: 72, y: 640, width: 180, height: 22 }, size: 14 })
          }}
        >
          Overlay text
        </Button>
      </aside>
    </div>
  )

  async function mutate(op: string, extra: Record<string, unknown>): Promise<void> {
    try {
      const result = await window.studio.runJob('pdf', { op, bytes, page: page - 1, ...extra })
      const next = asBytes(result && typeof result === 'object' && 'bytes' in (result as object) ? (result as { bytes: unknown }).bytes : result)
      if (next.byteLength > 0) updateTab(tab!.id, { pdfBytes: next, dirty: true, validation: op })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF edit failed')
    }
  }

  async function search(): Promise<void> {
    const pages = (await window.studio.runJob('pdf', { op: 'text', bytes })) as PdfText[]
    setHits(pages.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())))
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
    await exportBytes(tab!.title.endsWith('.pdf') ? tab!.title : 'document.pdf', bytes)
  }
}
