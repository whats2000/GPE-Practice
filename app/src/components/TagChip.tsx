export default function TagChip({
  tag,
  active = false,
  onClick,
}: {
  tag: string
  active?: boolean
  onClick?: () => void
}) {
  const base = 'inline-block rounded-full border px-2 py-0.5 text-xs'
  const tone = active
    ? 'border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
    : 'border-slate-300 text-slate-700 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300'
  const interactive = onClick ? 'cursor-pointer' : 'cursor-default'
  return (
    <span className={`${base} ${tone} ${interactive}`} onClick={onClick}>
      {tag}
    </span>
  )
}
