import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'
export type Hotkeys = 'default' | 'vscode' | 'vim'

export interface SettingsState {
  theme: Theme
  hotkeys: Hotkeys
  setTheme: (theme: Theme) => void
  setHotkeys: (hotkeys: Hotkeys) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      hotkeys: 'default',
      setTheme: (theme) => set({ theme }),
      setHotkeys: (hotkeys) => set({ hotkeys }),
    }),
    {
      name: 'gpe-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
