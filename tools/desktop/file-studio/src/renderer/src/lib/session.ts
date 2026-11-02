import { detectFile } from '@core/detect'
import { parseHtmlTables } from '@core/html/parse-tables'
import { createProject, type StudioProject } from '@core/image/project'
import { parseRecovery } from '@core/recovery/snapshot'
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

export function openBlank(kind: 'html' | 'json' | 'image'): void {
  const id = `tab-${Date.now()}-${counter++}`
  if (kind === 'html') {
    const html = '<table><caption>Untitled</caption><tr><th>Column 1</th><th>Column 2</th></tr><tr><td></td><td></td></tr></table>'
    const tables = parseHtmlTables(html)
    useWorkspace.getState().openTab({
      id,
      module: 'html',
      title: 'Untitled.html',
      dirty: true,
      html,
      tables,
      size: html.length,
      validation: `${tables.length} tables`,
      cursor: tables[0]?.id ?? ''
    })
    return
  }
  if (kind === 'json') {
    const text = '{\n  "records": []\n}'
    useWorkspace.getState().openTab({
      id,
      module: 'structured',
      title: 'Untitled.json',
      dirty: true,
      text,
      format: 'json',
      size: text.length,
      validation: 'New JSON',
      cursor: ''
    })
    return
  }
  useWorkspace.getState().openTab({
    id,
    module: 'image',
    title: 'Untitled.fstudio',
    dirty: true,
    kind: 'project',
    project: createProject(800, 600, null),
    size: 0,
    validation: '800×600',
    cursor: ''
  })
}

export async function openBlankPdf(): Promise<void> {
  const bytes = asBytes(await window.studio.runJob('pdf', { op: 'blank-doc' }))
  useWorkspace.getState().openTab({
    id: `tab-${Date.now()}-${counter++}`,
    module: 'pdf',
    title: 'Untitled.pdf',
    dirty: true,
    kind: 'pdf',
    pdfBytes: bytes,
    size: bytes.byteLength,
    validation: 'Blank PDF',
    cursor: ''
  })
}

export async function openFolder(): Promise<void> {
  const directory = await window.studio.pickDirectory()
  if (!directory) return
  const files = await window.studio.listFiles(directory)
  if (files.length === 0) {
    toast.message('That folder has no supported files.')
    return
  }
  const limit = 8
  for (const filePath of files.slice(0, limit)) await openPath(filePath)
  if (files.length > limit) toast.message(`Opened ${limit} files. The folder has ${files.length}. Use Batch to convert the rest.`)
}

export async function pasteClipboard(): Promise<void> {
  const image = await window.studio.clipboardImage()
  const picture = image ? asBytes(image) : null
  if (picture && picture.byteLength > 8) {
    await openBytes('clipboard.png', picture)
    return
  }
  const text = (await window.studio.clipboardText()).trim()
  if (!text) {
    toast.message('The clipboard is empty.')
    return
  }
  const name = text.startsWith('<') ? 'clipboard.html' : 'clipboard.json'
  await openBytes(name, new TextEncoder().encode(text))
}

export async function openRecovery(filePath: string): Promise<void> {
  const file = await window.studio.readFile(filePath)
  const recovered = parseRecovery(new TextDecoder().decode(asBytes(file.bytes)))
  const id = `recovery-${Date.now()}-${counter++}`
  if (recovered.kind === 'html' && recovered.html != null) {
    const tables = parseHtmlTables(recovered.html, { includeHidden: useSettings.getState().settings.includeHiddenHtml })
    useWorkspace.getState().openTab({
      id,
      module: 'html',
      title: recovered.title,
      dirty: true,
      html: recovered.html,
      tables,
      size: recovered.html.length,
      validation: `Recovered · ${tables.length} tables`,
      cursor: tables[0]?.id ?? ''
    })
    return
  }
  if (recovered.kind === 'structured' && recovered.text != null) {
    useWorkspace.getState().openTab({
      id,
      module: 'structured',
      title: recovered.title,
      dirty: true,
      text: recovered.text,
      format: recovered.format ?? 'json',
      size: recovered.text.length,
      validation: 'Recovered',
      cursor: ''
    })
    return
  }
  if (recovered.kind === 'project' && recovered.project) {
    useWorkspace.getState().openTab({
      id,
      module: 'image',
      title: recovered.title,
      dirty: true,
      kind: 'project',
      project: recovered.project as StudioProject,
      size: JSON.stringify(recovered.project).length,
      validation: 'Recovered project',
      cursor: ''
    })
    return
  }
  throw new Error('This recovery file has nothing to restore.')
}

export async function exportBytes(defaultName: string, bytes: Uint8Array): Promise<void> {
  const target = await window.studio.pickSave(defaultName)
  if (!target) return
  await window.studio.writeFile(target, bytes, false)
  toast.success(`Exported ${target.split(/[/\\]/).pop()}`)
}
