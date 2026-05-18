import { lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIdeStore } from '@/store'
import { useQuestionData } from '@/ide/useQuestionData'

const PracticeLayout = lazy(() => import('@/ide/PracticeLayout'))
const ExamLayout = lazy(() => import('@/ide/ExamLayout'))

export default function QuestionView() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const tabMode = useIdeStore((s) => s.tabMode)
  const setTabMode = useIdeStore((s) => s.setTabMode)
  const state = useQuestionData(id)

  if (state.kind === 'loading') {
    return <p className="text-sm text-muted-foreground">{t('ide.loading.statement')}</p>
  }
  if (state.kind === 'error') {
    return <p className="text-sm text-destructive">{state.message}</p>
  }

  const { data } = state
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {data.meta.gpeNo} · {data.meta.title}
        </h1>
        <Tabs value={tabMode} onValueChange={(v) => setTabMode(v as 'practice' | 'exam')}>
          <TabsList>
            <TabsTrigger value="practice">{t('ide.tabs.practice')}</TabsTrigger>
            <TabsTrigger value="exam">{t('ide.tabs.examMode')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">{t('ide.loading.statement')}</p>}>
        {tabMode === 'practice' ? <PracticeLayout data={data} /> : <ExamLayout data={data} />}
      </Suspense>
    </section>
  )
}
