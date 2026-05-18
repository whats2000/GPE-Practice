import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import MonacoEditor from './MonacoEditor'
import ProblemStatement from './ProblemStatement'
import TestcasePanel from './TestcasePanel'
import OutputPanel from './OutputPanel'
import { useIdeStore, type Verdict, type SubmissionRecord } from '@/store'
import { runJudge } from './runJudge'
import type { QuestionData } from './useQuestionData'

interface Props {
  data: QuestionData
}

const DEFAULT_SOURCE = `#include <bits/stdc++.h>
using namespace std;
int main() {
    // TODO: 在這裡撰寫程式碼
    return 0;
}
`

export default function PracticeLayout({ data }: Props) {
  const { t } = useTranslation()
  const qid = data.meta.id
  const source = useIdeStore((s) => s.source[qid] ?? DEFAULT_SOURCE)
  const setSource = useIdeStore((s) => s.setSource)
  const setResult = useIdeStore((s) => s.setResult)
  const appendSubmission = useIdeStore((s) => s.appendSubmission)

  const [running, setRunning] = useState(false)
  const [compileError, setCompileError] = useState<{ stderr: string } | null>(null)
  const [perCase, setPerCase] = useState<Record<string, { verdict: Verdict; stdout: string; stderr: string; ms: number }>>({})

  const visibleCases = data.cases.filter((c) => c.visibility !== 'hidden')

  const verdictsForBadges: Record<string, Verdict> = Object.fromEntries(
    Object.entries(perCase).map(([id, r]) => [id, r.verdict]),
  )

  async function run(opt: 'O0' | 'O2') {
    setRunning(true)
    setCompileError(null)
    setPerCase({})
    try {
      const casesToRun = opt === 'O0' ? visibleCases : data.cases
      const result = await runJudge({ meta: data.meta, source, cases: casesToRun, optimization: opt })
      if (result.kind === 'compile-error') {
        setCompileError({ stderr: result.stderr })
        if (opt === 'O2') {
          const rec: SubmissionRecord = {
            at: Date.now(),
            optimization: opt,
            perCase: {},
            overall: 'CE',
            compileMs: result.compileMs,
            totalRunMs: 0,
          }
          appendSubmission(qid, rec)
        }
        return
      }
      setPerCase(result.perCase)
      for (const [caseId, outcome] of Object.entries(result.perCase)) {
        setResult(qid, caseId, outcome.verdict)
      }
      if (opt === 'O2') {
        const rec: SubmissionRecord = {
          at: Date.now(),
          optimization: opt,
          perCase: Object.fromEntries(
            Object.entries(result.perCase).map(([k, v]) => [k, v.verdict]),
          ),
          overall: result.overall,
          compileMs: result.compileMs,
          totalRunMs: result.totalRunMs,
        }
        appendSubmission(qid, rec)
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-12rem)]">
      <div className="overflow-auto p-3 border border-border rounded">
        <ProblemStatement md={data.statementMd} />
      </div>
      <div className="flex flex-col border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted">
          <div className="text-xs text-muted-foreground">{t('ide.panes.code')} · {data.meta.gpeNo}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={running} onClick={() => run('O0')}>
              {running ? t('ide.buttons.running') : t('ide.buttons.run')}
            </Button>
            <Button size="sm" disabled={running} onClick={() => run('O2')}>
              {t('ide.buttons.submit')}
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor value={source} onChange={(s) => setSource(qid, s)} />
        </div>
        <div className="h-40 border-t border-border">
          <TestcasePanel cases={data.cases} verdicts={verdictsForBadges} />
        </div>
        <div className="h-40 border-t border-border">
          <OutputPanel
            compileError={compileError}
            perCase={perCase}
            caseIdsOrdered={visibleCases.map((c) => c.id)}
          />
        </div>
      </div>
    </div>
  )
}
