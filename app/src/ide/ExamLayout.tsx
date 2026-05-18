import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import MonacoEditor from './MonacoEditor'
import ProblemStatement from './ProblemStatement'
import { useIdeStore, type Verdict, type SubmissionRecord } from '@/store'
import { runJudge } from './runJudge'
import type { QuestionData } from './useQuestionData'

interface Props {
  data: QuestionData
}

const DEFAULT_SOURCE = `#include <bits/stdc++.h>
using namespace std;
int main() {

    return 0;
}
`

export default function ExamLayout({ data }: Props) {
  const { t } = useTranslation()
  const qid = data.meta.id
  const source = useIdeStore((s) => s.source[qid] ?? DEFAULT_SOURCE)
  const setSource = useIdeStore((s) => s.setSource)
  const setResult = useIdeStore((s) => s.setResult)
  const appendSubmission = useIdeStore((s) => s.appendSubmission)
  const [running, setRunning] = useState(false)
  const [showProblem, setShowProblem] = useState(false)
  const [buildLog, setBuildLog] = useState<string[]>([])

  function log(s: string) { setBuildLog((b) => [...b, s].slice(-200)) }

  async function f9() {
    setRunning(true)
    setBuildLog([`-------- Build: ${data.meta.gpeNo} - Debug --------`])
    try {
      const result = await runJudge({
        meta: data.meta, source, cases: data.cases.filter((c) => c.visibility !== 'hidden'),
        optimization: 'O0',
      })
      if (result.kind === 'compile-error') {
        log(`Compile error:\n${result.stderr}`)
        return
      }
      log(`Compile finished in ${result.compileMs.toFixed(0)} ms`)
      const verdicts: Record<string, Verdict> = {}
      for (const [caseId, r] of Object.entries(result.perCase)) {
        log(`  ${caseId}: ${r.verdict}  (${r.ms.toFixed(0)} ms)`)
        verdicts[caseId] = r.verdict
        setResult(qid, caseId, r.verdict)
      }
      log(`-------- Done. Overall: ${result.overall} --------`)
      const rec: SubmissionRecord = {
        at: Date.now(),
        optimization: 'O0',
        perCase: verdicts,
        overall: result.overall,
        compileMs: result.compileMs,
        totalRunMs: result.totalRunMs,
      }
      appendSubmission(qid, rec)
    } finally {
      setRunning(false)
    }
  }

  // i18n returns array via returnObjects — see https://www.i18next.com/translation-function/objects-and-arrays
  const menuItems = (t('ide.examChrome.menu', { returnObjects: true }) as unknown as string[]) ?? []

  return (
    <div
      className="flex flex-col h-[calc(100vh-8rem)] bg-[#ece9d8] dark:bg-slate-900 text-xs"
      onKeyDown={(e) => { if (e.key === 'F9') { e.preventDefault(); void f9() } }}
      tabIndex={0}
    >
      <div className="px-2 py-1 flex items-center gap-3 border-b border-slate-400/40 bg-gradient-to-b from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900">
        {Array.isArray(menuItems) && menuItems.map((label, i) => (
          <span key={i} className="px-1 cursor-default text-slate-700 dark:text-slate-300">
            {label}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowProblem((x) => !x)}>
            {showProblem ? t('ide.buttons.hideProblem') : t('ide.buttons.showProblem')}
          </Button>
          <Button size="sm" disabled={running} onClick={() => void f9()}>
            F9 · {running ? t('ide.buttons.running') : t('ide.buttons.run')}
          </Button>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        {showProblem && (
          <aside className="w-[28rem] overflow-auto p-3 border-r border-slate-400/40 bg-white dark:bg-slate-950">
            <ProblemStatement md={data.statementMd} />
          </aside>
        )}
        <div className="flex-1 min-h-0">
          <MonacoEditor value={source} onChange={(s) => setSource(qid, s)} />
        </div>
      </div>
      <div className="h-40 border-t border-slate-400/40 overflow-auto bg-white dark:bg-slate-950 p-2 font-mono text-[11px]">
        <div className="text-muted-foreground mb-1">{t('ide.examChrome.buildLog')}</div>
        {buildLog.map((line, i) => (<div key={i}>{line}</div>))}
      </div>
    </div>
  )
}
