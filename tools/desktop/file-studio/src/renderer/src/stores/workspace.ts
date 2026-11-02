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
  past: StudioTab[][]
  future: StudioTab[][]
  setModule: (module: ModuleId) => void
  openTab: (tab: StudioTab) => void
  updateTab: (id: string, patch: Partial<StudioTab>) => void
  editTab: (id: string, patch: Partial<StudioTab>) => void
  undo: () => void
  redo: () => void
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
  past: [],
  future: [],
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
  editTab: (id, patch) =>
    set((state) => ({
      past: [...state.past, state.tabs].slice(-15),
      future: [],
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab))
    })),
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const activeId = previous.some((tab) => tab.id === state.activeId) ? state.activeId : (previous.at(-1)?.id ?? null)
      const active = previous.find((tab) => tab.id === activeId)
      return {
        past: state.past.slice(0, -1),
        future: [...state.future, state.tabs].slice(-15),
        tabs: previous,
        activeId,
        module: active?.module ?? state.module
      }
    }),
  redo: () =>
    set((state) => {
      const next = state.future.at(-1)
      if (!next) return state
      const activeId = next.some((tab) => tab.id === state.activeId) ? state.activeId : (next.at(-1)?.id ?? null)
      const active = next.find((tab) => tab.id === activeId)
      return {
        future: state.future.slice(0, -1),
        past: [...state.past, state.tabs].slice(-15),
        tabs: next,
        activeId,
        module: active?.module ?? state.module
      }
    }),
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
