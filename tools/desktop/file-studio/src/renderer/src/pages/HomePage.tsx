import { FileImage, FileJson, FileSpreadsheet, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RecentFile } from '@shared/types'
import { openBytes, openPath } from '@renderer/lib/session'
import { asBytes } from '@renderer/lib/bytes'
import { useWorkspace, type ModuleId } from '@renderer/stores/workspace'

const modules: Array<{ id: ModuleId; title: string; copy: string; icon: typeof FileText }> = [
  { id: 'html', title: 'HTML tables', copy: 'Turn tables into Excel or CSV without touching the source file.', icon: FileSpreadsheet },
  { id: 'structured', title: 'JSON and XML', copy: 'Edit source, walk the tree, map nested records, and export.', icon: FileJson },
  { id: 'image', title: 'Images', copy: 'Crop, draw, annotate, and keep an editable project.', icon: FileImage },
  { id: 'pdf', title: 'PDFs', copy: 'Read, annotate, rearrange pages, and export a new PDF.', icon: FileText }
]

export function HomePage() {
  const setModule = useWorkspace((state) => state.setModule)
  const [recent, setRecent] = useState<RecentFile[]>([])
  useEffect(() => {
    void window.studio.recent().then(setRecent)
  }, [])

  return (
    <div
      className="h-full overflow-auto px-10 py-8"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void dropFiles(event.dataTransfer.files)
      }}
    >
      <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-teal)]">File Studio</p>
      <h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight">Open a file and work on it offline.</h1>
      <p className="mt-3 max-w-2xl text-base text-black/70 dark:text-white/70">
        Drop a file here, or pick a tool. Originals stay put until you explicitly overwrite them.
      </p>
      <div className="mt-8 grid max-w-4xl grid-cols-2 gap-4">
        {modules.map((item) => (
          <button
            key={item.id}
            className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-5 text-left shadow-sm hover:border-[var(--color-teal)] dark:border-white/10 dark:bg-white/5"
            onClick={() => setModule(item.id)}
          >
            <item.icon className="mb-4 text-[var(--color-teal)]" />
            <div className="text-lg font-semibold">{item.title}</div>
            <p className="mt-1 text-sm text-black/65 dark:text-white/65">{item.copy}</p>
          </button>
        ))}
      </div>
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide">Recent files</h2>
      <ul className="mt-3 max-w-3xl divide-y divide-[var(--color-line)]">
        {recent.length === 0 && <li className="py-3 text-sm text-black/50">Nothing opened yet.</li>}
        {recent.map((file) => (
          <li key={file.path}>
            <button className="flex w-full justify-between py-2 text-left text-sm hover:text-[var(--color-teal)]" onClick={() => void openPath(file.path)}>
              <span>{file.name}</span>
              <span className="text-black/45">{file.kind}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

async function dropFiles(files: FileList): Promise<void> {
  for (const file of files) {
    const bytes = asBytes(new Uint8Array(await file.arrayBuffer()))
    await openBytes(file.name, bytes)
  }
}
