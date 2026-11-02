import { create } from 'zustand'
import { defaultSettings, type AppSettings, type ThemeChoice } from '@shared/types'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,
  load: async () => {
    const settings = await window.studio.getSettings()
    set({ settings, loaded: true })
    applyTheme(settings.theme, settings.uiDensity)
  },
  update: async (patch) => {
    const settings = await window.studio.setSettings({ ...get().settings, ...patch })
    set({ settings })
    applyTheme(settings.theme, settings.uiDensity)
  }
}))

export function applyTheme(theme: ThemeChoice, density: AppSettings['uiDensity']): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark))
  document.documentElement.dataset.density = density
}
