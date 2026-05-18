import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        <Link to="/" className="text-blue-600 hover:underline">
          {t('notFound.backToList')}
        </Link>
      </p>
    </section>
  )
}
