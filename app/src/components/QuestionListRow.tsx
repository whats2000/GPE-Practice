import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { QuestionMeta } from '@/data/schema'
import { addNotPassedBonus } from '@/lib/recommendationScore'
import StatusBadge from './StatusBadge'
import TagChip from './TagChip'
import { useIdeStore } from '@/store'

export default function QuestionListRow({ q }: { q: QuestionMeta }) {
  const { t } = useTranslation()
  const isFav = useIdeStore((s) => s.isFavorite(q.id))
  const passed = useIdeStore((s) => s.hasPassed(q.id))
  const toggleFavorite = useIdeStore((s) => s.toggleFavorite)
  const status: 'untried' | 'tried' | 'passed' = passed
    ? 'passed'
    : isFav
      ? 'tried'
      : 'untried'

  const finalScore = addNotPassedBonus(q.stats.recommendationScore, passed)

  return (
    <li className="border-b border-slate-200 dark:border-slate-800 py-3 px-2 hover:bg-slate-100 dark:hover:bg-slate-900">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => toggleFavorite(q.id)}
          className="text-xl text-slate-300 hover:text-yellow-500"
          aria-label={isFav ? t('questionList.unfavorite') : t('questionList.favorite')}
        >
          {isFav ? '★' : '☆'}
        </button>
        <div className="w-14 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
          {finalScore}
        </div>
        <div className="flex-1 min-w-0">
          <Link to={`/q/${q.id}`} className="font-medium hover:underline">
            {q.gpeNo} · {q.title}
          </Link>
          <div className="mt-1 flex gap-1 flex-wrap">
            {q.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>
        </div>
        <div className="w-20 text-right text-sm text-slate-600 dark:text-slate-400">
          {q.stats.appearanceCount}
        </div>
        <div className="w-20 text-right text-sm text-slate-600 dark:text-slate-400">
          {q.stats.lastAppearedYear}
        </div>
        <div className="w-20 text-right text-sm text-slate-600 dark:text-slate-400">
          {(q.stats.acRate * 100).toFixed(0)}%
        </div>
        <div className="w-20 text-center">
          <StatusBadge status={status} />
        </div>
      </div>
    </li>
  )
}
