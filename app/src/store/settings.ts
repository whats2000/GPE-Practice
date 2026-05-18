import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'
export type Hotkeys = 'default' | 'vscode' | 'vim'

export interface SettingsState {
  theme: Theme
  hotkeys: Hotkeys
  rememberedPat: string
  targetOwner: string
  targetRepo: string
  setTheme: (theme: Theme) => void
  setHotkeys: (hotkeys: Hotkeys) => void
  setRememberedPat: (pat: string) => void
  setTargetOwner: (owner: string) => void
  setTargetRepo: (repo: string) => void
  clearRememberedPat: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      hotkeys: 'default',
      rememberedPat: '',
      targetOwner: '',
      targetRepo: '',
      setTheme: (theme) => set({ theme }),
      setHotkeys: (hotkeys) => set({ hotkeys }),
      setRememberedPat: (pat) => set({ rememberedPat: pat }),
      setTargetOwner: (owner) => set({ targetOwner: owner }),
      setTargetRepo: (repo) => set({ targetRepo: repo }),
      clearRememberedPat: () => set({ rememberedPat: '' }),
    }),
    {
      name: 'gpe-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
