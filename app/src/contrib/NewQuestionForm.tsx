import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import PatModal from './PatModal'
import { openPr } from './octokitClient'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormFields = {
  gpeYear: string
  gpeSession: string
  gpeNo: string
  title: string
  uvaId: string
  uvaName: string
  tags: string
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimitMs: string
  memLimitMb: string
  judge: 'whitespace' | 'exact' | 'float'
  sampleIn: string
  sampleOut: string
  statement: string
}

export default function NewQuestionForm({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const [f, setF] = useState<FormFields>({
    gpeYear: '2024',
    gpeSession: '1',
    gpeNo: '',
    title: '',
    uvaId: '',
    uvaName: '',
    tags: '',
    difficulty: 'easy',
    timeLimitMs: '2000',
    memLimitMb: '256',
    judge: 'whitespace',
    sampleIn: '',
    sampleOut: '',
    statement: '',
  })
  const [patOpen, setPatOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slug = `${f.gpeNo.toLowerCase()}-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  async function submitPr(pat: string, target: { owner: string; repo: string }) {
    setSubmitting(true)
    setError(null)
    try {
      const meta = {
        id: slug,
        title: f.title,
        gpeYear: Number(f.gpeYear),
        gpeSession: Number(f.gpeSession),
        gpeNo: f.gpeNo,
        uvaId: f.uvaId ? Number(f.uvaId) : null,
        uvaName: f.uvaName || null,
        tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean),
        difficulty: f.difficulty,
        timeLimitMs: Number(f.timeLimitMs),
        memLimitMb: Number(f.memLimitMb),
        judge: f.judge === 'float' ? { mode: 'float', eps: 1e-6 } : { mode: f.judge },
        generatedSeeds: [],
        stats: {
          appearanceCount: 1,
          lastAppearedYear: Number(f.gpeYear),
          acRate: 0.5,
          recommendationScore: 0,
        },
      }
      const statement = f.statement
        ? f.statement
        : `# ${f.title}\n\n見 [UVA ${f.uvaId} - ${f.uvaName}](https://onlinejudge.org/external/${f.uvaId}.pdf)\n`

      const result = await openPr({
        pat,
        target,
        branchPrefix: `new-question/${slug}`,
        files: [
          {
            path: `data/questions/${slug}/meta.json`,
            content: JSON.stringify(meta, null, 2) + '\n',
          },
          {
            path: `data/questions/${slug}/statement.md`,
            content: statement,
          },
          {
            path: `data/questions/${slug}/cases/sample-01.in`,
            content: f.sampleIn.endsWith('\n') ? f.sampleIn : f.sampleIn + '\n',
          },
          {
            path: `data/questions/${slug}/cases/sample-01.out`,
            content: f.sampleOut.endsWith('\n') ? f.sampleOut : f.sampleOut + '\n',
          },
          {
            path: `data/questions/${slug}/solutions/reference.cpp`,
            content: `// TODO: paste reference solution here\nint main() { return 0; }\n`,
          },
        ],
        commitMessage: t('contrib.newQuestion.commitMessage', { gpeNo: f.gpeNo }),
        prTitle: t('contrib.newQuestion.prTitle', { gpeNo: f.gpeNo, title: f.title }),
        prBody: t('contrib.newQuestion.prBody', { gpeNo: f.gpeNo, title: f.title }),
        labels: ['new-question'],
      })
      setResultUrl(result.prUrl)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('contrib.newQuestion.title')}</DialogTitle>
        </DialogHeader>

        {resultUrl ? (
          <div className="space-y-2">
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
              {t('contrib.pat.successTitle')}
            </p>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all text-sm">
              {resultUrl}
            </a>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.gpeYear')}</Label>
                <Input value={f.gpeYear} onChange={(e) => set('gpeYear', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.gpeSession')}</Label>
                <Input value={f.gpeSession} onChange={(e) => set('gpeSession', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.gpeNo')}</Label>
                <Input value={f.gpeNo} onChange={(e) => set('gpeNo', e.target.value)} placeholder="B056" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.title')}</Label>
              <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="兩數之和" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.uvaId')}</Label>
                <Input value={f.uvaId} onChange={(e) => set('uvaId', e.target.value)} placeholder="12345" />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.uvaName')}</Label>
                <Input value={f.uvaName} onChange={(e) => set('uvaName', e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.tags')}</Label>
              <Input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="array, hashing" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.difficulty')}</Label>
                <select
                  value={f.difficulty}
                  onChange={(e) => set('difficulty', e.target.value as FormFields['difficulty'])}
                  className="block w-full rounded-md border border-input bg-background h-10 px-3 text-sm"
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.timeLimitMs')}</Label>
                <Input value={f.timeLimitMs} onChange={(e) => set('timeLimitMs', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.memLimitMb')}</Label>
                <Input value={f.memLimitMb} onChange={(e) => set('memLimitMb', e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.judge')}</Label>
              <select
                value={f.judge}
                onChange={(e) => set('judge', e.target.value as FormFields['judge'])}
                className="block w-full rounded-md border border-input bg-background h-10 px-3 text-sm"
              >
                <option value="whitespace">whitespace</option>
                <option value="exact">exact</option>
                <option value="float">float (eps=1e-6)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.sampleIn')}</Label>
                <Textarea value={f.sampleIn} onChange={(e) => set('sampleIn', e.target.value)} className="min-h-[4rem]" />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.sampleOut')}</Label>
                <Textarea value={f.sampleOut} onChange={(e) => set('sampleOut', e.target.value)} className="min-h-[4rem]" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.statement')}</Label>
              <Textarea
                value={f.statement}
                onChange={(e) => set('statement', e.target.value)}
                className="min-h-[6rem]"
                placeholder="# 題目 ..."
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}

        {!resultUrl && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('contrib.pat.cancel')}</Button>
            <Button onClick={() => setPatOpen(true)} disabled={!f.gpeNo || !f.title || !f.sampleIn || !f.sampleOut}>
              {t('contrib.newQuestion.submit')}
            </Button>
          </DialogFooter>
        )}
        <PatModal open={patOpen} onOpenChange={setPatOpen} onSubmit={submitPr} submitting={submitting} />
      </DialogContent>
    </Dialog>
  )
}
