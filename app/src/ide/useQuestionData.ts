import { useEffect, useState } from 'react'
import type { QuestionManifestEntry, CaseRef } from '@/data/schema'
import { questions } from '@/data/manifest.gen'

export interface CaseData extends CaseRef {
  stdin: string
  expected: string
}

export interface QuestionData {
  meta: QuestionManifestEntry
  statementMd: string
  cases: CaseData[]
}

export type QuestionLoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: QuestionData }

async function loadQuestionData(meta: QuestionManifestEntry): Promise<QuestionData> {
  const base = `${import.meta.env.BASE_URL}data/questions/${meta.id}`
  const stmtUrl = `${base}/statement.md`
  const stmt = await fetch(stmtUrl).then((r) => {
    if (!r.ok) throw new Error(`statement.md: HTTP ${r.status}`)
    return r.text()
  })
  const cases: CaseData[] = await Promise.all(
    meta.caseList.map(async (c) => {
      const inUrl = `${base}/cases/${c.id}.in`
      const outUrl = `${base}/cases/${c.id}.out`
      const [stdin, expected] = await Promise.all([
        fetch(inUrl).then((r) => r.text()),
        fetch(outUrl).then((r) => r.text()),
      ])
      return { ...c, stdin, expected }
    }),
  )
  return { meta, statementMd: stmt, cases }
}

export function useQuestionData(id: string | undefined): QuestionLoadState {
  const [state, setState] = useState<QuestionLoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    if (!id) {
      setState({ kind: 'error', message: 'Missing question id' })
      return
    }
    const meta = questions.find((q) => q.id === id) as QuestionManifestEntry | undefined
    if (!meta) {
      setState({ kind: 'error', message: `Unknown question: ${id}` })
      return
    }
    loadQuestionData(meta)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: 'error', message: (e as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return state
}
