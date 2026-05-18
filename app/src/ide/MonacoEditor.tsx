import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

const Editor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
)

interface MonacoEditorProps {
  value: string
  onChange: (next: string) => void
  language?: string
  height?: string
  theme?: 'light' | 'vs-dark'
  options?: Record<string, unknown>
}

export default function MonacoEditor({
  value,
  onChange,
  language = 'cpp',
  height = '100%',
  theme = 'vs-dark',
  options,
}: MonacoEditorProps) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      }
    >
      <Editor
        height={height}
        language={language}
        value={value}
        theme={theme}
        onChange={(next) => onChange(next ?? '')}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          tabSize: 4,
          insertSpaces: true,
          renderWhitespace: 'selection',
          smoothScrolling: true,
          automaticLayout: true,
          ...options,
        }}
      />
    </Suspense>
  )
}
