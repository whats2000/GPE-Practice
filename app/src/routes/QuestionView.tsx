import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function QuestionView() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('questionView.title', { id })}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {t('questionView.placeholder')}
      </p>
    </section>
  )
}
