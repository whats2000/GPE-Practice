import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { questions } from '@/data/manifest.gen'
import { addNotPassedBonus } from '@/lib/recommendationScore'
import QuestionListRow from '@/components/QuestionListRow'
import TagChip from '@/components/TagChip'
import { useIdeStore } from '@/store'

type SortKey = 'recommendation' | 'appearances' | 'recency' | 'acRate' | 'title'

export default function QuestionList() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('recommendation')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [hidePassed, setHidePassed] = useState(false)

  const ide = useIdeStore()

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const q of questions) for (const t of q.tags) set.add(t)
    return Array.from(set).sort()
  }, [])

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = questions.filter((meta) => {
      if (q) {
        const haystack = `${meta.title} ${meta.gpeNo}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (activeTags.size > 0 && !meta.tags.some((t) => activeTags.has(t))) return false
      if (hidePassed && ide.hasPassed(meta.id)) return false
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'recommendation': {
          const sa = addNotPassedBonus(a.stats.recommendationScore, ide.hasPassed(a.id))
          const sb = addNotPassedBonus(b.stats.recommendationScore, ide.hasPassed(b.id))
          return sb - sa
        }
        case 'appearances':
          return b.stats.appearanceCount - a.stats.appearanceCount
        case 'recency':
          return b.stats.lastAppearedYear - a.stats.lastAppearedYear
        case 'acRate':
          return a.stats.acRate - b.stats.acRate
        case 'title':
          return a.title.localeCompare(b.title, 'zh-Hant')
      }
    })
    return sorted
  }, [query, sortKey, activeTags, hidePassed, ide])

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <section>
      <h1 className="text-2xl font-bold">{t('questionList.title')}</h1>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('questionList.search')}
          className="flex-1 min-w-[200px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <label className="text-sm flex items-center gap-2">
          {t('questionList.sortBy')}：
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          >
            <option value="recommendation">{t('questionList.sort.recommendation')}</option>
            <option value="appearances">{t('questionList.sort.appearances')}</option>
            <option value="recency">{t('questionList.sort.recency')}</option>
            <option value="acRate">{t('questionList.sort.acRate')}</option>
            <option value="title">{t('questionList.sort.title')}</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={hidePassed}
            onChange={(e) => setHidePassed(e.target.checked)}
          />
          {t('questionList.hidePassed')}
        </label>
      </div>

      {allTags.length > 0 && (
        <div className="mt-3 flex gap-1 flex-wrap">
          {allTags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              active={activeTags.has(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        {filteredSorted.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400">
            {questions.length === 0 ? t('questionList.empty') : t('questionList.noMatches')}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 px-2 py-2 border-b-2 border-slate-300 dark:border-slate-700 text-xs uppercase tracking-wider text-slate-500">
              <div className="w-8" />
              <div className="w-14 text-right">{t('questionList.columns.recommendationScore')}</div>
              <div className="flex-1">{t('questionList.columns.title')}</div>
              <div className="w-20 text-right">{t('questionList.columns.appearanceCount')}</div>
              <div className="w-20 text-right">{t('questionList.columns.lastAppearedYear')}</div>
              <div className="w-20 text-right">{t('questionList.columns.acRate')}</div>
              <div className="w-20 text-center">{t('questionList.columns.myStatus')}</div>
            </div>
            <ul>
              {filteredSorted.map((q) => (
                <QuestionListRow key={q.id} q={q} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
