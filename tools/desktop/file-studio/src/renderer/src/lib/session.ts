import { detectFile } from '@core/detect'
import { parseHtmlTables } from '@core/html/parse-tables'
import { createProject } from '@core/image/project'
import { useSettings } from '@renderer/stores/settings'
import { useWorkspace, type StudioTab } from '@renderer/stores/workspace'
import { toast } from 'sonner'
import { asBytes, bytesToBase64 } from './bytes'

let counter = 0

export async function openPickedFiles(): Promise<void> {
  const files = await window.studio.openFiles()
  for (const file of files) await openBytes(file.name, asBytes(file.bytes), file.path)
}

export async function openPath(filePath: string): Promise<void> {
  const file = await window.studio.readFile(filePath)
  await openBytes(file.name, asBytes(file.bytes), file.path)
}

export async function openBytes(name: string, bytes: Uint8Array, filePath?: string): Promise<void> {
  const detected = detectFile(name, bytes)
  if (detected.warning) toast.warning(detected.warning)
  if (bytes.byteLength > useSettings.getState().settings.largeFileBytes) {
    const proceed = await window.studio.confirm(`${name} is large (${bytes.byteLength} bytes). Open it anyway?`)
    if (!proceed) return
  }
  const id = `tab-${Date.now()}-${counter++}`
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const base: StudioTab = {
    id,
    module: 'home',
    title: name,
    path: filePath,
    kind: detected.kind === 'unknown' ? undefined : detected.kind,
    dirty: false,
    size: bytes.byteLength,
    warning: detected.warning,
    validation: 'Ready',
    cursor: ''
  }
  if (detected.kind === 'html') {
    const tables = parseHtmlTables(text, { includeHidden: useSettings.getState().settings.includeHiddenHtml })
    useWorkspace.getState().openTab({
      ...base,
      module: 'html',
      html: text,
      tables,
      cursor: tables[0]?.id ?? '',
      validation: `${tables.length} tables`
    })
  } else if (detected.kind === 'structured') {
    const format = name.toLowerCase().endsWith('.xml') ? 'xml' : name.toLowerCase().endsWith('.jsonl') ? 'jsonl' : 'json'
    useWorkspace.getState().openTab({ ...base, module: 'structured', text, format })
  } else if (detected.kind === 'image') {
    const info = (await window.studio.runJob('image-info', { bytes })) as { width: number; height: number; format: string }
    const project = createProject(info.width || 800, info.height || 600, { mime: `image/${info.format}`, dataBase64: bytesToBase64(bytes) })
    useWorkspace.getState().openTab({ ...base, module: 'image', project, validation: `${info.width}×${info.height} ${info.format}` })
  } else if (detected.kind === 'pdf') {
    useWorkspace.getState().openTab({ ...base, module: 'pdf', pdfBytes: bytes, validation: 'PDF' })
  } else if (detected.kind === 'project') {
    const project = JSON.parse(text) as StudioTab['project']
    useWorkspace.getState().openTab({ ...base, module: 'image', project, kind: 'project' })
  } else {
    toast.error(`File Studio does not know how to open ${name}.`)
    return
  }
  if (filePath) {
    await window.studio.remember({ path: filePath, name, kind: detected.kind, openedAt: Date.now() })
  }
}

export async function saveActive(saveAs: boolean): Promise<void> {
  const state = useWorkspace.getState()
  const tab = state.tabs.find((item) => item.id === state.activeId)
  if (!tab) return
  const bytes = encodeTab(tab)
  if (!bytes) {
    toast.error('This tab has nothing to save yet.')
    return
  }
  let target = saveAs ? null : tab.path ?? null
  if (!target) target = await window.studio.pickSave(downloadName(tab))
  if (!target) return
  const overwrite = !saveAs && target === tab.path
  if (overwrite) {
    const confirmed = await window.studio.confirm(`Overwrite ${tab.title}? A .bak copy will be kept beside it.`)
    if (!confirmed) return
  }
  await window.studio.writeFile(target, bytes, overwrite)
  state.updateTab(tab.id, { path: target, dirty: false, title: target.split(/[/\\]/).pop() ?? tab.title })
  toast.success(overwrite ? 'Saved over the original' : 'Saved a new file')
}

function encodeTab(tab: StudioTab): Uint8Array | null {
  if (tab.module === 'html' && tab.html != null) return new TextEncoder().encode(tab.html)
  if (tab.module === 'structured' && tab.text != null) return new TextEncoder().encode(tab.text)
  if (tab.module === 'image' && tab.project) return new TextEncoder().encode(JSON.stringify(tab.project, null, 2))
  if (tab.module === 'pdf' && tab.pdfBytes) return tab.pdfBytes
  return null
}

function downloadName(tab: StudioTab): string {
  if (tab.module === 'image') return `${tab.title.replace(/\.[^.]+$/, '')}.fstudio`
  if (tab.module === 'pdf') return tab.title.endsWith('.pdf') ? tab.title : `${tab.title}.pdf`
  return tab.title
}

export async function exportBytes(defaultName: string, bytes: Uint8Array): Promise<void> {
  const target = await window.studio.pickSave(defaultName)
  if (!target) return
  await window.studio.writeFile(target, bytes, false)
  toast.success(`Exported ${target.split(/[/\\]/).pop()}`)
}
