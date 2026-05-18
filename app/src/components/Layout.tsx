import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Layout() {
  const { t } = useTranslation()
  const location = useLocation()
  const isActive = (path: string) =>
    location.pathname === path
      ? 'text-blue-600 dark:text-blue-400 font-semibold'
      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-6">
          <Link to="/" className="text-xl font-bold">
            {t('common.appName')}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className={isActive('/')}>{t('nav.questions')}</Link>
            <Link to="/settings" className={isActive('/settings')}>{t('nav.settings')}</Link>
          </nav>
          <a
            href="https://gpe-helper.setsal.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            {t('common.originalSite')} ↗
          </a>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-800 mt-auto">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-slate-500">
          {t('common.footer')}
        </div>
      </footer>
    </div>
  )
}
