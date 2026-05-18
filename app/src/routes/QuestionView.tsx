import { useParams } from 'react-router-dom'

export default function QuestionView() {
  const { id } = useParams<{ id: string }>()
  return (
    <section>
      <h1 className="text-2xl font-bold">題目：{id}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Phase 4 將加入 Practice / Exam Mode 分頁與 Monaco 編輯器。
      </p>
    </section>
  )
}
