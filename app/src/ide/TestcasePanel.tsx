import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseData } from './useQuestionData'

interface Props {
  cases: CaseData[]
  verdicts: Record<string, 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'>
}

export default function TestcasePanel({ cases, verdicts }: Props) {
  const { t } = useTranslation()
  const visible = cases.filter((c) => c.visibility !== 'hidden')
  const [activeId, setActiveId] = useState<string | null>(visible[0]?.id ?? null)
  const active = visible.find((c) => c.id === activeId) ?? null

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground p-2">{t('ide.errors.noCasesVisible')}</p>
  }

  const verdictBadgeClass = (v: string) => {
    switch (v) {
      case 'AC': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'WA': return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'TLE': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'RE': return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 overflow-x-auto p-1 border-b border-border">
        {visible.map((c) => {
          const v = verdicts[c.id] ?? 'PENDING'
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`text-xs rounded px-2 py-1 whitespace-nowrap ${
                c.id === activeId ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              <span>{c.id}</span>
              <span className={`ml-2 px-1 rounded ${verdictBadgeClass(v)}`}>
                {t(`ide.verdict.${v}`)}
              </span>
            </button>
          )
        })}
      </div>
      {active && (
        <div className="flex-1 overflow-auto p-2 grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs font-mono">
          <div>
            <div className="text-muted-foreground mb-1">stdin</div>
            <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{active.stdin}</pre>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">expected stdout</div>
            <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{active.expected}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
