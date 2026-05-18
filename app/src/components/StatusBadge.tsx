import { useTranslation } from 'react-i18next'

type Status = 'untried' | 'tried' | 'passed'

const colors: Record<Status, string> = {
  untried: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  tried: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  passed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {t(`questionList.status.${status}`)}
    </span>
  )
}
