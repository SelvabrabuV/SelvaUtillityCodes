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
              setItems(files.map((file) => ({ path: file.path, status: 'queued', detail: file.name })))
            })
          }}
        >
          Add files
        </Button>
        <select className="rounded border px-2" value={policy} onChange={(event) => setPolicy(event.target.value as CollisionPolicy)}>
          <option value="number">Numbered names</option>
          <option value="rename">Rename copies</option>
          <option value="skip">Skip existing</option>
          <option value="overwrite">Overwrite</option>
        </select>
        <Button onClick={() => void run('html')}>HTML to Excel</Button>
        <Button onClick={() => void run('image')}>Images to WebP</Button>
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
          <li key={item.path} className="flex justify-between py-2 text-sm">
            <span>{item.detail}</span>
            <span>{item.status}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  async function run(kind: 'html' | 'image'): Promise<void> {
    const directory = await window.studio.pickDirectory()
    if (!directory) return
    cancelRef.current = false
    for (let index = 0; index < items.length; index += 1) {
      while (pausedRef.current && !cancelRef.current) await new Promise((resolve) => setTimeout(resolve, 200))
      if (cancelRef.current) break
      const item = items[index]
      if (item.status === 'done') continue
      setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'running' } : entry)))
      try {
        const file = await window.studio.readFile(item.path)
        const bytes = asBytes(file.bytes)
        const name = kind === 'html' ? file.name.replace(/\.html?$/i, '') + '.xlsx' : file.name.replace(/\.\w+$/, '') + '.webp'
        const target = await window.studio.outputPath(directory, name, policy)
        if (!target) {
          setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'skipped', detail: 'Already exists' } : entry)))
          continue
        }
        const payload =
          kind === 'html'
            ? asBytes(await window.studio.runJob('html-excel', { html: new TextDecoder().decode(bytes) }))
            : asBytes((await window.studio.runJob('image-render', { bytes, options: { format: 'webp', quality: 0.9 } })) as { bytes: Uint8Array })
        await window.studio.writeFile(target, payload, policy === 'overwrite')
        setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'done', detail: target } : entry)))
      } catch (error) {
        setItems((current) =>
          current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'failed', detail: error instanceof Error ? error.message : 'Failed' } : entry))
        )
      }
    }
    toast.success(cancelRef.current ? 'Batch cancelled' : 'Batch finished')
  }
}
