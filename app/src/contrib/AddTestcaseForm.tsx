import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PatModal from './PatModal'
import { openPr } from './octokitClient'
import { defaultCompiler, defaultRuntime } from '@/engine'
import type { QuestionManifestEntry } from '@/data/schema'

interface Props {
  meta: QuestionManifestEntry
  currentSource: string
  onClose: () => void
}

export default function AddTestcaseForm({ meta, currentSource, onClose }: Props) {
  const { t } = useTranslation()
  const [stdin, setStdin] = useState('')
  const [expected, setExpected] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<{ output: string; match: boolean } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [patOpen, setPatOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runPreview() {
    setPreviewing(true)
    setPreview(null)
    try {
      const compileResult = await defaultCompiler.compile(currentSource, { optimization: 'O0' })
      if (!compileResult.ok) {
        setPreview({ output: compileResult.stderr, match: false })
        return
      }
      const run = await defaultRuntime.run(compileResult.wasm, stdin, meta.timeLimitMs)
      if (run.kind === 'ok') {
        const trimmedActual = run.stdout.replace(/\s+$/g, '')
        const trimmedExpected = expected.replace(/\s+$/g, '')
        setPreview({ output: run.stdout, match: trimmedActual === trimmedExpected })
      } else {
        setPreview({ output: `(${run.kind})`, match: false })
      }
    } finally {
      setPreviewing(false)
    }
  }

  async function submitPr(pat: string, target: { owner: string; repo: string }) {
    setSubmitting(true)
    setError(null)
    try {
      const existing = meta.caseList
        .filter((c) => c.id.startsWith('community-'))
        .map((c) => {
          const n = Number(c.id.replace('community-', ''))
          return Number.isFinite(n) ? n : 0
        })
      const next = (existing.length === 0 ? 0 : Math.max(...existing)) + 1
      const caseId = `community-${String(next).padStart(3, '0')}`

      const result = await openPr({
        pat,
        target,
        branchPrefix: `add-case/${meta.id}`,
        files: [
          {
            path: `data/questions/${meta.id}/cases/${caseId}.in`,
            content: stdin.endsWith('\n') ? stdin : stdin + '\n',
          },
          {
            path: `data/questions/${meta.id}/cases/${caseId}.out`,
            content: expected.endsWith('\n') ? expected : expected + '\n',
          },
        ],
        commitMessage: t('contrib.testcase.commitMessage', { qid: meta.id }),
        prTitle: t('contrib.testcase.prTitle', { qid: meta.id }),
        prBody: t('contrib.testcase.prBody', { qid: meta.id, note: note ? `\n\n${note}` : '' }),
      })
      setResultUrl(result.prUrl)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  if (resultUrl) {
    return (
      <div className="p-3 space-y-2 text-sm">
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
          {t('contrib.pat.successTitle')}
        </p>
        <a
          href={resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all"
        >
          {resultUrl}
        </a>
        <div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="font-semibold">{t('contrib.testcase.title')} · {meta.gpeNo}</div>

      <div>
        <Label htmlFor="atc-stdin" className="mb-1 block">{t('contrib.testcase.stdin')}</Label>
        <Textarea id="atc-stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} className="min-h-[5rem]" />
      </div>
      <div>
        <Label htmlFor="atc-out" className="mb-1 block">{t('contrib.testcase.expected')}</Label>
        <Textarea id="atc-out" value={expected} onChange={(e) => setExpected(e.target.value)} className="min-h-[5rem]" />
      </div>
      <div>
        <Label htmlFor="atc-note" className="mb-1 block">{t('contrib.testcase.note')}</Label>
        <Input
          id="atc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('contrib.testcase.notePlaceholder')}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={runPreview} disabled={previewing || !stdin}>
          {previewing ? t('contrib.testcase.previewing') : t('contrib.testcase.preview')}
        </Button>
        <Button size="sm" onClick={() => setPatOpen(true)} disabled={!stdin || !expected || submitting}>
          {submitting ? t('contrib.pat.submitting') : t('contrib.testcase.submitButton')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('contrib.pat.cancel')}
        </Button>
      </div>

      {preview && (
        <div className="bg-muted p-2 rounded text-xs font-mono">
          <div className="text-muted-foreground mb-1">{t('contrib.testcase.previewOutput')}</div>
          <pre className="whitespace-pre-wrap break-all">{preview.output}</pre>
          <p className={`mt-1 ${preview.match ? 'text-emerald-600' : 'text-amber-600'}`}>
            {preview.match
              ? t('contrib.testcase.previewMatch')
              : t('contrib.testcase.previewMismatch')}
          </p>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <PatModal open={patOpen} onOpenChange={setPatOpen} onSubmit={submitPr} submitting={submitting} />
    </div>
  )
}
