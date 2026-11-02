import { create } from 'zustand'
import type { DocKind } from '@shared/types'
import type { ParsedTable } from '@core/html/parse-tables'
import type { StudioProject } from '@core/image/project'

export type ModuleId = 'home' | 'html' | 'structured' | 'image' | 'pdf' | 'batch' | 'recent' | 'settings'

export interface StudioTab {
  id: string
  module: ModuleId
  title: string
  path?: string
  kind?: DocKind
  dirty: boolean
  html?: string
  tables?: ParsedTable[]
  text?: string
  format?: 'json' | 'xml' | 'jsonl'
  project?: StudioProject
  pdfBytes?: Uint8Array
  size: number
  warning?: string
  validation: string
  cursor: string
}

interface WorkspaceState {
  module: ModuleId
  tabs: StudioTab[]
  activeId: string | null
  progress: string
  setModule: (module: ModuleId) => void
  openTab: (tab: StudioTab) => void
  updateTab: (id: string, patch: Partial<StudioTab>) => void
  closeTab: (id: string) => void
  activate: (id: string) => void
  moveTab: (id: string, direction: -1 | 1) => void
  setProgress: (progress: string) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  module: 'home',
  tabs: [],
  activeId: null,
  progress: '',
  setModule: (module) => set({ module }),
  openTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeId: tab.id,
      module: tab.module
    })),
  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab))
    })),
  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeId = state.activeId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeId
      const active = tabs.find((tab) => tab.id === activeId)
      return { tabs, activeId, module: active?.module ?? 'home' }
    }),
  activate: (id) =>
    set((state) => ({
      activeId: id,
      module: state.tabs.find((tab) => tab.id === id)?.module ?? state.module
    })),
  moveTab: (id, direction) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === id)
      const next = index + direction
      if (index < 0 || next < 0 || next >= state.tabs.length) return state
      const tabs = [...state.tabs]
      const [tab] = tabs.splice(index, 1)
      tabs.splice(next, 0, tab)
      return { tabs }
    }),
  setProgress: (progress) => set({ progress })
}))

export function activeTab(state: WorkspaceState): StudioTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeId)
}
