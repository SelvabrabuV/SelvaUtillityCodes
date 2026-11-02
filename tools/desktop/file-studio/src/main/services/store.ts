import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { defaultSettings, type AppSettings, type RecentFile } from '@shared/types'

interface DiskState {
  settings: AppSettings
  recent: RecentFile[]
}

const fileName = 'preferences.json'

export async function loadState(): Promise<DiskState> {
  try {
    const raw = await readFile(join(app.getPath('userData'), fileName), 'utf8')
    const parsed = JSON.parse(raw) as Partial<DiskState>
    return {
      settings: { ...defaultSettings, ...parsed.settings },
      recent: Array.isArray(parsed.recent) ? parsed.recent : []
    }
  } catch {
    return { settings: { ...defaultSettings }, recent: [] }
  }
}

export async function saveState(state: DiskState): Promise<void> {
  const directory = app.getPath('userData')
  await mkdir(directory, { recursive: true })
  const target = join(directory, fileName)
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
  await writeFile(target, await readFile(temporary))
  const { rm } = await import('node:fs/promises')
  await rm(temporary, { force: true })
}

export async function recoveryDir(): Promise<string> {
  const directory = join(app.getPath('userData'), 'recovery')
  await mkdir(directory, { recursive: true })
  return directory
}
