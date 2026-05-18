import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export default function ProblemStatement({ md }: { md: string }) {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none prose-pre:bg-slate-900">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{md}</ReactMarkdown>
    </article>
  )
}
