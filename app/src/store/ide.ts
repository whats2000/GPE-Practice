import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Verdict = 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'

export interface IdeState {
  source: Record<string, string>          // keyed by questionId
  results: Record<string, Record<string, Verdict>>  // questionId -> caseId -> verdict
  isRunning: boolean
  setSource: (questionId: string, src: string) => void
  setResult: (questionId: string, caseId: string, verdict: Verdict) => void
  setRunning: (running: boolean) => void
}

export const useIdeStore = create<IdeState>()(
  persist(
    (set) => ({
      source: {},
      results: {},
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
    }),
    {
      name: 'gpe-ide-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ source: state.source, results: state.results }),
    },
  ),
)
