import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section>
      <h1 className="text-2xl font-bold">找不到頁面</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        <Link to="/" className="text-blue-600 hover:underline">
          回到題目列表
        </Link>
      </p>
    </section>
  )
}
