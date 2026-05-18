import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Verdict = 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'

export type TabMode = 'practice' | 'exam'

export interface SubmissionRecord {
  at: number
  optimization: 'O0' | 'O2'
  perCase: Record<string, Verdict>
  overall: 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'
  compileMs: number
  totalRunMs: number
}

export interface IdeState {
  source: Record<string, string>
  results: Record<string, Record<string, Verdict>>
  favorites: Record<string, true>
  submissions: Record<string, SubmissionRecord[]>
  tabMode: TabMode
  isRunning: boolean
  setSource: (questionId: string, src: string) => void
  setResult: (questionId: string, caseId: string, verdict: Verdict) => void
  setRunning: (running: boolean) => void
  toggleFavorite: (questionId: string) => void
  isFavorite: (questionId: string) => boolean
  hasPassed: (questionId: string) => boolean
  setTabMode: (mode: TabMode) => void
  appendSubmission: (questionId: string, record: SubmissionRecord) => void
  clearSubmissions: (questionId: string) => void
}

export const useIdeStore = create<IdeState>()(
  persist(
    (set, get) => ({
      source: {},
      results: {},
      favorites: {},
      submissions: {},
      tabMode: 'practice',
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
      setTabMode: (mode) => set({ tabMode: mode }),
      appendSubmission: (questionId, record) =>
        set((s) => ({
          submissions: {
            ...s.submissions,
            [questionId]: [...(s.submissions[questionId] ?? []), record].slice(-50),
          },
        })),
      clearSubmissions: (questionId) =>
        set((s) => {
          const next = { ...s.submissions }
          delete next[questionId]
          return { submissions: next }
        }),
    }),
    {
      name: 'gpe-ide-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        source: state.source,
        results: state.results,
        favorites: state.favorites,
        submissions: state.submissions,
        tabMode: state.tabMode,
      }),
    },
  ),
)
