import { FolderOpen, Moon, Redo2, Save, Search, Sun, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { Button } from '@renderer/components/ui'
import { formatSize } from '@renderer/lib/bytes'
import { runCommand } from '@renderer/lib/commands'
import { buildRecovery, recoveryFileName } from '@core/recovery/snapshot'
import { openBlank, openBlankPdf, openFolder, openPath, openPickedFiles, pasteClipboard, saveActive } from '@renderer/lib/session'
import { useSettings } from '@renderer/stores/settings'
import { activeTab, useWorkspace, type ModuleId } from '@renderer/stores/workspace'
import { BatchPage } from './pages/BatchPage'
import { HomePage } from './pages/HomePage'
import { HtmlPage } from './pages/HtmlPage'
import { ImagePage } from './pages/ImagePage'
import { PdfPage } from './pages/PdfPage'
import { SettingsPage } from './pages/SettingsPage'
import { StructuredPage } from './pages/StructuredPage'

const nav: Array<{ id: ModuleId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'html', label: 'HTML' },
  { id: 'structured', label: 'JSON / XML' },
  { id: 'image', label: 'Image' },
  { id: 'pdf', label: 'PDF' },
  { id: 'batch', label: 'Batch' },
  { id: 'recent', label: 'Recent' },
  { id: 'settings', label: 'Settings' }
]

export default function App() {
  const module = useWorkspace((state) => state.module)
  const setModule = useWorkspace((state) => state.setModule)
  const tabs = useWorkspace((state) => state.tabs)
  const activeId = useWorkspace((state) => state.activeId)
  const activate = useWorkspace((state) => state.activate)
  const moveTab = useWorkspace((state) => state.moveTab)
  const progress = useWorkspace((state) => state.progress)
  const tab = useWorkspace(activeTab)
  const settings = useSettings((state) => state.settings)
  const load = useSettings((state) => state.load)
  const update = useSettings((state) => state.update)
  const [creating, setCreating] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    void load()
    const stop = window.studio.onCommand((command) => {
      if (command === 'open') void openPickedFiles()
      if (command === 'open-folder') void openFolder()
      if (command === 'save') void saveActive(false)
      if (command === 'save-as') void saveActive(true)
      if (command === 'close-tab' && activeId) void closeWithCheck(activeId)
      if (command === 'theme') void update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
      if (command === 'home') setModule('home')
      if (command === 'undo') undoDocument()
      if (command === 'redo') redoDocument()
      if (command === 'find') runCommand('find')
      if (command === 'export') exportActive()
      if (command === 'zoom-in') setZoom((current) => Math.min(1.6, Number((current + 0.1).toFixed(2))))
      if (command === 'zoom-out') setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))
      if (command === 'zoom-reset') setZoom(1)
    })
    const stopE2e = window.studio.onE2eOpen((filePath) => void openPath(filePath))
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      const typing = editingTarget(event.target)
      if (key === 'o') {
        event.preventDefault()
        void openPickedFiles()
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault()
        void saveActive(true)
      } else if (key === 's') {
        event.preventDefault()
        void saveActive(false)
      } else if (key === 'w') {
        event.preventDefault()
        if (activeId) void closeWithCheck(activeId)
      } else if (key === 'tab') {
        event.preventDefault()
        const index = tabs.findIndex((item) => item.id === activeId)
        const next = tabs[(index + 1) % Math.max(tabs.length, 1)]
        if (next) activate(next.id)
      } else if (!typing && (key === 'z' || key === 'y')) {
        event.preventDefault()
        if (key === 'y' || event.shiftKey) redoDocument()
        else undoDocument()
      } else if (!typing && key === 'f') {
        event.preventDefault()
        runCommand('find')
      } else if (!typing && key === 'h') {
        event.preventDefault()
        runCommand('replace')
      } else if (!typing && (key === '=' || key === '+')) {
        event.preventDefault()
        setZoom((current) => Math.min(1.6, Number((current + 0.1).toFixed(2))))
      } else if (!typing && key === '-') {
        event.preventDefault()
        setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))
      } else if (!typing && key === '0') {
        event.preventDefault()
        setZoom(1)
      } else if (!typing && key === 'v') {
        event.preventDefault()
        void pasteClipboard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      stopE2e()
      window.removeEventListener('keydown', onKey)
    }
  }, [activate, activeId, load, setModule, settings.theme, tabs, update])

  useEffect(() => {
    if (!settings.autosave) return
    const timer = window.setInterval(() => {
      void saveRecoveryCopies()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [settings.autosave, tabs])

  return (
    <div className="grid h-full grid-cols-[196px_1fr] grid-rows-[auto_1fr_28px] bg-[var(--color-paper)] text-[var(--color-ink)] dark:bg-[#1b1e22] dark:text-[#ece7df]">
      <header className="col-span-2 flex flex-wrap items-center gap-1 border-b border-[var(--color-line)] px-3 py-1 dark:border-white/10">
        <strong className="mr-2">File Studio</strong>
        <div className="relative">
          <Button tone="quiet" onClick={() => setCreating((open) => !open)}>
            New
          </Button>
          {creating && (
            <div className="absolute left-0 top-9 z-30 w-44 rounded-lg border border-[var(--color-line)] bg-white p-1 text-sm shadow dark:bg-[#222]">
              <button className="block w-full rounded px-2 py-1 text-left hover:bg-black/5" onClick={() => { setCreating(false); openBlank('html') }}>HTML table</button>
              <button className="block w-full rounded px-2 py-1 text-left hover:bg-black/5" onClick={() => { setCreating(false); openBlank('json') }}>JSON document</button>
              <button className="block w-full rounded px-2 py-1 text-left hover:bg-black/5" onClick={() => { setCreating(false); openBlank('image') }}>Image canvas</button>
              <button className="block w-full rounded px-2 py-1 text-left hover:bg-black/5" onClick={() => { setCreating(false); void openBlankPdf() }}>Blank PDF</button>
            </div>
          )}
        </div>
        <Button tone="quiet" onClick={() => void openPickedFiles()}>
          <FolderOpen size={16} /> Open
        </Button>
        <Button tone="quiet" onClick={() => void openFolder()}>
          Folder
        </Button>
        <Button tone="quiet" onClick={() => void saveActive(false)}>
          <Save size={16} /> Save
        </Button>
        <Button tone="quiet" onClick={() => void saveActive(true)}>
          Save as
        </Button>
        <Button tone="quiet" onClick={() => undoDocument()}>
          <Undo2 size={16} /> Undo
        </Button>
        <Button tone="quiet" onClick={() => redoDocument()}>
          <Redo2 size={16} /> Redo
        </Button>
        <Button tone="quiet" onClick={() => exportActive()}>
          Export
        </Button>
        <Button tone="quiet" onClick={() => runCommand('find')}>
          <Search size={16} /> Search
        </Button>
        <Button tone="quiet" onClick={() => setZoom((current) => Math.min(1.6, Number((current + 0.1).toFixed(2))))}>+</Button>
        <Button tone="quiet" onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}>−</Button>
        <Button tone="quiet" onClick={() => void update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
          {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
        <div className="ml-auto flex gap-1 overflow-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={`rounded px-2 py-1 text-sm ${item.id === activeId ? 'bg-[var(--color-teal)] text-white' : ''}`}
              onClick={() => activate(item.id)}
              onDoubleClick={() => moveTab(item.id, 1)}
            >
              {item.dirty ? '• ' : ''}
              {item.title}
              <span
                className="ml-2"
                onClick={(event) => {
                  event.stopPropagation()
                  void closeWithCheck(item.id)
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      </header>
      <nav className="border-r border-[var(--color-line)] p-2 dark:border-white/10">
        {nav.map((item) => (
          <button
            key={item.id}
            className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm ${module === item.id ? 'bg-[#1f4e5a] text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
            onClick={() => setModule(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="min-h-0 min-w-0" style={{ zoom }}>
        {module === 'home' && <HomePage />}
        {module === 'html' && <HtmlPage />}
        {module === 'structured' && <StructuredPage />}
        {module === 'image' && <ImagePage />}
        {module === 'pdf' && <PdfPage />}
        {module === 'batch' && <BatchPage />}
        {module === 'settings' && <SettingsPage />}
        {module === 'recent' && <HomePage />}
      </main>
      <footer className="col-span-2 flex items-center gap-4 border-t border-[var(--color-line)] px-3 text-xs dark:border-white/10">
        <span>{tab?.title ?? 'No file'}</span>
        <span>{tab?.kind ?? module}</span>
        <span>{tab ? formatSize(tab.size) : ''}</span>
        <span>{tab?.validation ?? ''}</span>
        <span>{tab?.cursor ?? ''}</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span className="ml-auto">{tab?.dirty ? 'Unsaved changes' : progress || 'Ready'}</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}

async function saveRecoveryCopies(): Promise<void> {
  const state = useWorkspace.getState()
  for (const tab of state.tabs) {
    if (!tab.dirty) continue
    let document: Parameters<typeof buildRecovery>[0] | null = null
    if (tab.module === 'html' && tab.html != null) document = { kind: 'html', title: tab.title, savedAt: Date.now(), html: tab.html }
    else if (tab.module === 'structured' && tab.text != null) {
      document = { kind: 'structured', title: tab.title, savedAt: Date.now(), text: tab.text, format: tab.format }
    } else if (tab.module === 'image' && tab.project) {
      document = { kind: 'project', title: tab.title, savedAt: Date.now(), project: tab.project }
    }
    if (!document) continue
    const body = buildRecovery(document)
    if (body.length > 8_000_000) continue
    await window.studio.writeRecovery(recoveryFileName(tab.title, tab.id), new TextEncoder().encode(body))
  }
}

function undoDocument(): void {
  if (!runCommand('undo')) useWorkspace.getState().undo()
}

function redoDocument(): void {
  if (!runCommand('redo')) useWorkspace.getState().redo()
}

function exportActive(): void {
  if (!runCommand('export')) toast.message('Open a document before exporting.')
}

function editingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor'))
}

async function closeWithCheck(id: string): Promise<void> {
  const tab = useWorkspace.getState().tabs.find((item) => item.id === id)
  if (tab?.dirty) {
    const proceed = await window.studio.confirm(`${tab.title} has unsaved changes. Close it?`)
    if (!proceed) return
  }
  useWorkspace.getState().closeTab(id)
  toast.dismiss()
}
