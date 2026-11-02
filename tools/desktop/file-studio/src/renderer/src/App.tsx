import { FolderOpen, Moon, Save, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { Button } from '@renderer/components/ui'
import { formatSize } from '@renderer/lib/bytes'
import { openPath, openPickedFiles, saveActive } from '@renderer/lib/session'
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

  useEffect(() => {
    void load()
    const stop = window.studio.onCommand((command) => {
      if (command === 'open') void openPickedFiles()
      if (command === 'open-folder') void window.studio.pickDirectory()
      if (command === 'save') void saveActive(false)
      if (command === 'save-as') void saveActive(true)
      if (command === 'close-tab' && activeId) void closeWithCheck(activeId)
      if (command === 'theme') void update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
      if (command === 'home') setModule('home')
    })
    const stopE2e = window.studio.onE2eOpen((filePath) => void openPath(filePath))
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
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
      } else if ((key === 'f' || key === 'h') && typing) {
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      stopE2e()
      window.removeEventListener('keydown', onKey)
    }
  }, [activate, activeId, load, setModule, settings.theme, tabs, update])

  return (
    <div className="grid h-full grid-cols-[196px_1fr] grid-rows-[48px_1fr_28px] bg-[var(--color-paper)] text-[var(--color-ink)] dark:bg-[#1b1e22] dark:text-[#ece7df]">
      <header className="col-span-2 flex items-center gap-2 border-b border-[var(--color-line)] px-3 dark:border-white/10">
        <strong className="mr-2">File Studio</strong>
        <Button tone="quiet" onClick={() => void openPickedFiles()}>
          <FolderOpen size={16} /> Open
        </Button>
        <Button tone="quiet" onClick={() => void saveActive(false)}>
          <Save size={16} /> Save
        </Button>
        <Button tone="quiet" onClick={() => void saveActive(true)}>
          Save as
        </Button>
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
      <main className="min-h-0 min-w-0">
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
        <span className="ml-auto">{tab?.dirty ? 'Unsaved changes' : progress || 'Ready'}</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </div>
  )
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
