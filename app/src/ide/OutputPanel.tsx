import { useTranslation } from 'react-i18next'

interface CaseOutcome {
  verdict: 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'
  stdout: string
  stderr: string
  ms: number
}

interface Props {
  compileError?: { stderr: string } | null
  perCase: Record<string, CaseOutcome>
  caseIdsOrdered: string[]
}

export default function OutputPanel({ compileError, perCase, caseIdsOrdered }: Props) {
  const { t } = useTranslation()

  if (compileError) {
    return (
      <div className="h-full overflow-auto p-2">
        <div className="text-sm font-semibold text-destructive mb-1">{t('ide.errors.compileFailed')}</div>
        <pre className="bg-muted text-xs p-2 rounded whitespace-pre-wrap font-mono">{compileError.stderr}</pre>
      </div>
    )
  }

  const items = caseIdsOrdered.filter((id) => perCase[id])
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground p-2">—</p>
  }

  return (
    <div className="h-full overflow-auto p-2 space-y-2">
      {items.map((id) => {
        const r = perCase[id]
        return (
          <details key={id} className="rounded border border-border">
            <summary className="cursor-pointer px-2 py-1 text-sm flex items-center justify-between">
              <span className="font-mono">{id}</span>
              <span className="text-xs text-muted-foreground">
                {t(`ide.verdict.${r.verdict}`)} · {r.ms.toFixed(0)} ms
              </span>
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 p-2 text-xs font-mono">
              <div>
                <div className="text-muted-foreground mb-1">stdout</div>
                <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{r.stdout || '(empty)'}</pre>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">stderr</div>
                <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{r.stderr || '(empty)'}</pre>
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}
