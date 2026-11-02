import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { resolveOutputPath, type CollisionPolicy } from '@core/batch/paths'
import { isInsideDir } from '@core/security/paths'

const files = new Set<string>()
const directories = new Set<string>()

export function allowFile(filePath: string): string {
  const resolved = path.resolve(filePath)
  files.add(resolved)
  return resolved
}

export function allowDirectory(directory: string): string {
  const resolved = path.resolve(directory)
  directories.add(resolved)
  return resolved
}

export function assertDirectory(directory: string): string {
  const resolved = path.resolve(directory)
  if (!directories.has(resolved)) throw new Error('Choose the folder from the Open Folder dialog.')
  return resolved
}

export function outputPath(directory: string, fileName: string, policy: CollisionPolicy): string | null {
  const root = assertDirectory(directory)
  const target = resolveOutputPath(root, fileName, existsSync, policy)
  if (target) allowFile(target)
  return target
}

export function assertCanRead(filePath: string): string {
  const resolved = path.resolve(filePath)
  if (files.has(resolved)) return resolved
  if ([...directories].some((directory) => isInsideDir(directory, resolved))) return resolved
  throw new Error('That file was not opened from a dialog or drop.')
}

export function assertCanWrite(filePath: string, overwrite: boolean): string {
  const resolved = path.resolve(filePath)
  const allowed = files.has(resolved) || [...directories].some((directory) => isInsideDir(directory, resolved))
  if (!allowed) throw new Error('Choose a destination with Save As or the export folder.')
  if (files.has(resolved) && !overwrite) throw new Error('Saving over the original needs confirmation.')
  return resolved
}

export async function openFiles(window: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile', 'multiSelections'],
    filters: dialogFilters()
  })
  if (result.canceled) return []
  return result.filePaths.map((filePath) => allowFile(filePath))
}

export async function openDirectory(window: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return allowDirectory(result.filePaths[0])
}

export async function chooseSavePath(window: BrowserWindow, defaultName: string): Promise<string | null> {
  const result = await dialog.showSaveDialog(window, {
    defaultPath: defaultName,
    filters: dialogFilters()
  })
  if (result.canceled || !result.filePath) return null
  return allowFile(result.filePath)
}

export async function readBytes(filePath: string): Promise<Uint8Array> {
  const resolved = assertCanRead(filePath)
  return new Uint8Array(await readFile(resolved))
}

export async function writeBytes(filePath: string, bytes: Uint8Array, overwrite: boolean): Promise<void> {
  const resolved = assertCanWrite(filePath, overwrite)
  await mkdir(path.dirname(resolved), { recursive: true })
  const exists = await stat(resolved).then(
    () => true,
    () => false
  )
  if (exists && overwrite) await copyFile(resolved, `${resolved}.bak`)
  const temporary = `${resolved}.${process.pid}.tmp`
  await writeFile(temporary, bytes)
  try {
    if (exists) await rm(resolved, { force: true })
    await rename(temporary, resolved)
  } catch {
    await writeFile(resolved, bytes)
    await rm(temporary, { force: true })
  }
  allowFile(resolved)
}

export async function confirm(window: BrowserWindow, message: string): Promise<boolean> {
  const result = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    message
  })
  return result.response === 1
}

function dialogFilters(): OpenDialogOptions['filters'] {
  return [
    { name: 'File Studio', extensions: ['html', 'htm', 'json', 'jsonl', 'ndjson', 'xml', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'pdf', 'fstudio'] },
    { name: 'All files', extensions: ['*'] }
  ]
}
