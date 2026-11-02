import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { readdir, stat } from 'node:fs/promises'
import { clipboard } from 'electron'
import { defaultSettings, type AppSettings, type RecentFile } from '@shared/types'
import { extensionOf } from '@core/detect'
import {
  allowDirectory,
  allowFile,
  assertCanRead,
  assertDirectory,
  chooseSavePath,
  outputPath,
  confirm,
  openDirectory,
  openFiles,
  readBytes,
  writeBytes
} from './services/files'
import { runJob } from './services/jobs'
import { loadState, recoveryDir, saveState } from './services/store'

let state = { settings: { ...defaultSettings }, recent: [] as RecentFile[] }
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'File Studio',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const dev = is.dev
    const csp = dev
      ? "default-src 'self' http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' http://localhost:* ws://localhost:*"
      : "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))

  Menu.setApplicationMenu(buildMenu())
}

function buildMenu(): Menu {
  const send = (command: string) => mainWindow?.webContents.send('command', command)
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Open Folder…', click: () => send('open-folder') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Theme', click: () => send('theme') },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    { label: 'Help', submenu: [{ label: 'File Studio', click: () => send('home') }] }
  ])
}

function trusted(event: Electron.IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const allowed = url.startsWith('file://') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')
  if (!allowed) throw new Error('Untrusted caller')
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.selvautilitycodes.filestudio')
  state = await loadState()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  const openArg = process.argv.find((arg) => arg.startsWith('--open='))
  if (process.env.FILE_STUDIO_E2E === '1' && openArg) {
    const filePath = allowFile(openArg.slice('--open='.length))
    mainWindow?.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('e2e-open', filePath)
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpc(): void {
  ipcMain.handle('settings:get', (event) => {
    trusted(event)
    return state.settings
  })
  ipcMain.handle('settings:set', async (event, settings: AppSettings) => {
    trusted(event)
    state.settings = { ...defaultSettings, ...settings }
    await saveState(state)
    return state.settings
  })
  ipcMain.handle('recent:list', (event) => {
    trusted(event)
    return state.recent
  })
  ipcMain.handle('recent:add', async (event, file: RecentFile) => {
    trusted(event)
    state.recent = [file, ...state.recent.filter((item) => item.path !== file.path)].slice(0, state.settings.recentLimit)
    await saveState(state)
    return state.recent
  })
  ipcMain.handle('dialog:open', async (event) => {
    trusted(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return []
    const paths = await openFiles(window)
    const opened = []
    for (const filePath of paths) {
      const bytes = await readBytes(filePath)
      opened.push({ path: filePath, name: filePath.split(/[/\\]/).pop() ?? filePath, bytes })
    }
    return opened
  })
  ipcMain.handle('dialog:directory', async (event) => {
    trusted(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    return openDirectory(window)
  })
  ipcMain.handle('dialog:save', async (event, defaultName: string) => {
    trusted(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    return chooseSavePath(window, defaultName)
  })
  ipcMain.handle('dialog:confirm', async (event, message: string) => {
    trusted(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    return confirm(window, message)
  })
  ipcMain.handle('fs:read', async (event, filePath: string) => {
    trusted(event)
    const bytes = await readBytes(filePath)
    return { path: filePath, name: filePath.split(/[/\\]/).pop() ?? filePath, bytes }
  })
  ipcMain.handle('fs:write', async (event, request: { path: string; bytes: Uint8Array; overwrite: boolean }) => {
    trusted(event)
    await writeBytes(request.path, request.bytes, request.overwrite === true)
  })
  ipcMain.handle('fs:list', async (event, directory: string) => {
    trusted(event)
    const root = assertDirectory(directory)
    const entries = await readdir(root, { withFileTypes: true })
    const known = new Set(['.html', '.htm', '.json', '.jsonl', '.xml', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.pdf', '.fstudio'])
    const filesFound: string[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!known.has(extensionOf(entry.name))) continue
      const full = allowFile(join(root, entry.name))
      const info = await stat(full)
      if (info.size > state.settings.largeFileBytes * 4) continue
      filesFound.push(full)
    }
    return filesFound
  })
  ipcMain.handle('fs:output', (event, request: { directory: string; fileName: string; policy: 'rename' | 'overwrite' | 'skip' | 'number' }) => {
    trusted(event)
    return outputPath(request.directory, request.fileName, request.policy)
  })
  ipcMain.handle('fs:show', (event, filePath: string) => {
    trusted(event)
    shell.showItemInFolder(assertCanRead(filePath))
  })
  ipcMain.handle('clip:text', (event) => {
    trusted(event)
    return clipboard.readText()
  })
  ipcMain.handle('clip:image', async (event) => {
    trusted(event)
    const items = await clipboard.read()
    for (const item of items) {
      const type = item.types.find((entry) => entry.startsWith('image/'))
      if (!type) continue
      const payload = await item.getType(type)
      if (!(payload instanceof Blob)) continue
      return new Uint8Array(await payload.arrayBuffer())
    }
    return null
  })
  ipcMain.handle('job:run', (event, request: { type: string; payload: Record<string, unknown> }) => {
    trusted(event)
    return runJob(request.type, request.payload ?? {})
  })
  ipcMain.handle('recovery:dir', async (event) => {
    trusted(event)
    const directory = await recoveryDir()
    return allowDirectory(directory)
  })
}
