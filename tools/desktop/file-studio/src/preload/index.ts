import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppSettings, RecentFile } from '@shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings),
  recent: (): Promise<RecentFile[]> => ipcRenderer.invoke('recent:list'),
  remember: (file: RecentFile): Promise<RecentFile[]> => ipcRenderer.invoke('recent:add', file),
  openFiles: (): Promise<Array<{ path: string; name: string; bytes: Uint8Array }>> => ipcRenderer.invoke('dialog:open'),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:directory'),
  pickSave: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('dialog:save', defaultName),
  confirm: (message: string): Promise<boolean> => ipcRenderer.invoke('dialog:confirm', message),
  readFile: (filePath: string): Promise<{ path: string; name: string; bytes: Uint8Array }> => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath: string, bytes: Uint8Array, overwrite: boolean): Promise<void> =>
    ipcRenderer.invoke('fs:write', { path: filePath, bytes, overwrite }),
  listFiles: (directory: string): Promise<string[]> => ipcRenderer.invoke('fs:list', directory),
  outputPath: (directory: string, fileName: string, policy: 'rename' | 'overwrite' | 'skip' | 'number'): Promise<string | null> =>
    ipcRenderer.invoke('fs:output', { directory, fileName, policy }),
  showInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('fs:show', filePath),
  clipboardText: (): Promise<string> => ipcRenderer.invoke('clip:text'),
  clipboardImage: (): Promise<Uint8Array | null> => ipcRenderer.invoke('clip:image'),
  runJob: (type: string, payload: Record<string, unknown>): Promise<unknown> => ipcRenderer.invoke('job:run', { type, payload }),
  recoveryDir: (): Promise<string> => ipcRenderer.invoke('recovery:dir'),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  onCommand: (handler: (command: string) => void): (() => void) => {
    const listener = (_event: unknown, command: string): void => handler(command)
    ipcRenderer.on('command', listener)
    return () => ipcRenderer.removeListener('command', listener)
  },
  onE2eOpen: (handler: (filePath: string) => void): (() => void) => {
    const listener = (_event: unknown, filePath: string): void => handler(filePath)
    ipcRenderer.on('e2e-open', listener)
    return () => ipcRenderer.removeListener('e2e-open', listener)
  }
}

contextBridge.exposeInMainWorld('studio', api)

export type StudioApi = typeof api
