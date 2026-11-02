import { useRef, useState } from 'react'
import type { CollisionPolicy } from '@core/batch/paths'
import { Button } from '@renderer/components/ui'
import { asBytes } from '@renderer/lib/bytes'
import { toast } from 'sonner'

interface BatchItem {
  path: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped'
  detail: string
}

export function BatchPage() {
  const [items, setItems] = useState<BatchItem[]>([])
  const [paused, setPaused] = useState(false)
  const [policy, setPolicy] = useState<CollisionPolicy>('number')
  const pausedRef = useRef(false)
  const cancelRef = useRef(false)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Batch conversion</h1>
      <p className="mt-2 text-sm text-black/70">Files are read one at a time. Pause waits between files. Cancel stops the queue.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          tone="solid"
          onClick={() => {
            void window.studio.openFiles().then((files) => {
              setItems((current) => [...current, ...files.map((file) => ({ path: file.path, status: 'queued' as const, detail: file.name }))])
            })
          }}
        >
          Add files
        </Button>
        <Button
          onClick={() => {
            void window.studio.pickDirectory().then(async (directory) => {
              if (!directory) return
              const files = await window.studio.listFiles(directory)
              setItems((current) => [...current, ...files.map((file) => ({ path: file, status: 'queued' as const, detail: file.split(/[/\\]/).pop() ?? file }))])
            })
          }}
        >
          Add folder
        </Button>
        <Button onClick={() => setItems((current) => current.filter((item) => item.status === 'running'))}>Remove finished</Button>
        <select className="rounded border px-2" value={policy} onChange={(event) => setPolicy(event.target.value as CollisionPolicy)}>
          <option value="number">Numbered names</option>
          <option value="rename">Rename copies</option>
          <option value="skip">Skip existing</option>
          <option value="overwrite">Overwrite</option>
        </select>
        <Button onClick={() => void run('html')}>HTML to Excel</Button>
        <Button onClick={() => void run('json')}>JSON to CSV</Button>
        <Button onClick={() => void run('image')}>Images to WebP</Button>
        <Button onClick={() => void mergePdfs()}>Merge PDFs</Button>
        <Button
          onClick={() => {
            pausedRef.current = !pausedRef.current
            setPaused(pausedRef.current)
          }}
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          onClick={() => {
            cancelRef.current = true
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            setItems((current) => current.map((item) => (item.status === 'failed' ? { ...item, status: 'queued', detail: item.path } : item)))
          }}
        >
          Retry failed
        </Button>
      </div>
      <ul className="mt-6 divide-y">
        {items.map((item) => (
          <li key={`${item.path}-${item.detail}`} className="flex justify-between gap-3 py-2 text-sm">
            <span className="truncate">{item.detail}</span>
            <span className="flex gap-2">
              <button onClick={() => setItems((current) => current.filter((entry) => entry !== item))}>Remove</button>
              <span>{item.status}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )

  async function mergePdfs(): Promise<void> {
    const queued = items.filter((item) => item.path.toLowerCase().endsWith('.pdf'))
    if (queued.length < 2) {
      toast.error('Add at least two PDF files.')
      return
    }
    const directory = await window.studio.pickDirectory()
    if (!directory) return
    try {
      const first = await window.studio.readFile(queued[0].path)
      const others = []
      for (const item of queued.slice(1)) {
        const file = await window.studio.readFile(item.path)
        others.push(asBytes(file.bytes))
      }
      const merged = asBytes(await window.studio.runJob('pdf', { op: 'merge', bytes: asBytes(first.bytes), others }))
      const target = await window.studio.outputPath(directory, 'merged.pdf', policy)
      if (!target) {
        toast.message('Skipped the merged PDF because the name already exists.')
        return
      }
      await window.studio.writeFile(target, merged, policy === 'overwrite')
      await window.studio.showInFolder(target)
      toast.success('Merged PDF written')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Merge failed')
    }
  }

  async function run(kind: 'html' | 'json' | 'image'): Promise<void> {
    const directory = await window.studio.pickDirectory()
    if (!directory) return
    cancelRef.current = false
    let lastWritten: string | null = null
    for (let index = 0; index < items.length; index += 1) {
      while (pausedRef.current && !cancelRef.current) await new Promise((resolve) => setTimeout(resolve, 200))
      if (cancelRef.current) break
      const item = items[index]
      if (item.status === 'done') continue
      setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'running' } : entry)))
      try {
        const file = await window.studio.readFile(item.path)
        const bytes = asBytes(file.bytes)
        const name =
          kind === 'html' ? file.name.replace(/\.\w+$/, '') + '.xlsx' : kind === 'json' ? file.name.replace(/\.\w+$/, '') + '.csv' : file.name.replace(/\.\w+$/, '') + '.webp'
        const target = await window.studio.outputPath(directory, name, policy)
        if (!target) {
          setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'skipped', detail: 'Already exists' } : entry)))
          continue
        }
        const payload =
          kind === 'html'
            ? asBytes(await window.studio.runJob('html-excel', { html: new TextDecoder().decode(bytes) }))
            : kind === 'json'
              ? new TextEncoder().encode(
                  (
                    (await window.studio.runJob('structured-csv', {
                      text: new TextDecoder().decode(bytes),
                      fileName: file.name
                    })) as { csv: string }
                  ).csv
                )
              : asBytes((await window.studio.runJob('image-render', { bytes, options: { format: 'webp', quality: 0.9 } })) as { bytes: Uint8Array })
        await window.studio.writeFile(target, payload, policy === 'overwrite')
        lastWritten = target
        setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'done', detail: target } : entry)))
      } catch (error) {
        setItems((current) =>
          current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'failed', detail: error instanceof Error ? error.message : 'Failed' } : entry))
        )
      }
    }
    if (lastWritten) await window.studio.showInFolder(lastWritten)
    toast.success(cancelRef.current ? 'Batch cancelled' : 'Batch finished')
  }
}
