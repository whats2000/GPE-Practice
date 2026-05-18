import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Verdict = 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'

export interface IdeState {
  source: Record<string, string>
  results: Record<string, Record<string, Verdict>>
  favorites: Record<string, true>
  isRunning: boolean
  setSource: (questionId: string, src: string) => void
  setResult: (questionId: string, caseId: string, verdict: Verdict) => void
  setRunning: (running: boolean) => void
  toggleFavorite: (questionId: string) => void
  isFavorite: (questionId: string) => boolean
  hasPassed: (questionId: string) => boolean
}

export const useIdeStore = create<IdeState>()(
  persist(
    (set, get) => ({
      source: {},
      results: {},
      favorites: {},
      isRunning: false,
      setSource: (questionId, src) =>
        set((s) => ({ source: { ...s.source, [questionId]: src } })),
      setResult: (questionId, caseId, verdict) =>
        set((s) => ({
          results: {
            ...s.results,
            [questionId]: { ...(s.results[questionId] ?? {}), [caseId]: verdict },
          },
        })),
      setRunning: (running) => set({ isRunning: running }),
      toggleFavorite: (questionId) =>
        set((s) => {
          const next = { ...s.favorites }
          if (next[questionId]) delete next[questionId]
          else next[questionId] = true
          return { favorites: next }
        }),
      isFavorite: (questionId) => !!get().favorites[questionId],
      hasPassed: (questionId) => {
        const r = get().results[questionId]
        if (!r) return false
        return Object.values(r).some((v) => v === 'AC')
      },
    }),
    {
      name: 'gpe-ide-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        source: state.source,
        results: state.results,
        favorites: state.favorites,
      }),
    },
  ),
)
