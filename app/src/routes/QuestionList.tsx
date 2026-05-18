import { useTranslation } from 'react-i18next'

export default function QuestionList() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('questionList.title')}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {t('questionList.placeholder')}
      </p>
    </section>
  )
}
