# Phase 4 — IDE Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 3 engine (Compiler + Runtime + judge) into the IDE UI. Visiting `/q/<id>` loads the question, opens Monaco with the user's saved source, lets them edit, click "▶ 執行" to run against open test cases (`-O0`), and click "✓ 提交" to run against all canonical cases (`-O2`). Tabs let them switch between Practice mode (LeetCode-style split: problem | editor) and Exam mode (Code::Blocks-style full-page chrome). Per-question source and submission history persist to localStorage.

**Architecture:**
- Cases + statements live on disk at `data/questions/<id>/` (Phase 2 layout). `tools/build-manifest.ts` already walks this tree. Phase 4 extends the script to **copy** statements and visible cases into `app/public/data/questions/<id>/` so the SPA can fetch them at runtime. Hidden cases ship the same way (the IDE just doesn't display their contents — only their verdicts).
- Monaco loads lazily on first IDE mount (`@monaco-editor/react`). The chunk is ~2 MB gz so it's split out.
- shadcn/ui lands here (Tabs, Button) — deferred from Phase 1 per plan.
- `defaultCompiler` + `defaultRuntime` from `engine/` are singletons; the IDE imports and calls them. First call spawns the emception worker; subsequent calls reuse it.
- COOP/COEP enforced at request time in dev via `vite.config.ts` `server.headers`. In production GitHub Pages, the COI service worker (Phase 3 Task 4) handles it.

**Tech Stack:** `@monaco-editor/react` ^4 (Monaco wrapper), `react-markdown` ^9 + `rehype-highlight` ^7 + `highlight.js` ^11 (markdown rendering for statement.md with code-fence highlighting), `tailwindcss-animate` (shadcn requirement), Radix UI primitives (transitively via shadcn).

**Out of scope for Phase 4:** Contribution forms (Phase 5); GitHub Actions / `validate-pr.yml` / `register-new-question.yml` (Phase 6); seeding additional questions beyond the 3 dev seeds (Phase 7); Playwright browser tests against the real emception engine (deferred — useful but not gating; covered in a small smoke test that mocks the compiler).

---

## Files Created/Modified

- Create: `app/src/routes/QuestionView.tsx` (replace placeholder with full impl)
- Create: `app/src/ide/PracticeLayout.tsx`
- Create: `app/src/ide/ExamLayout.tsx`
- Create: `app/src/ide/MonacoEditor.tsx`
- Create: `app/src/ide/TestcasePanel.tsx`
- Create: `app/src/ide/OutputPanel.tsx`
- Create: `app/src/ide/ProblemStatement.tsx`
- Create: `app/src/ide/useQuestionData.ts` (data hook + types)
- Create: `app/src/ide/runJudge.ts` (compile→run→judge orchestration)
- Create: `app/src/components/ui/tabs.tsx` (shadcn)
- Create: `app/src/components/ui/button.tsx` (shadcn)
- Create: `app/src/lib/utils.ts` (shadcn's `cn` helper)
- Create: `app/src/ide/runJudge.test.ts`
- Modify: `app/src/i18n/zh-Hant.json` (add IDE strings)
- Modify: `app/src/store/ide.ts` (add `tabMode`, submission history helpers)
- Modify: `app/vite.config.ts` (COOP/COEP headers for dev)
- Modify: `tools/build-manifest.ts` (copy statements + cases to `app/public/data/`)
- Modify: `app/.gitignore` (ignore `src/data/manifest.gen.ts` already; add `public/data/` since it's copied at build time)
- Modify: `app/tailwind.config.ts` (shadcn theme tokens + animate plugin)
- Modify: `app/src/index.css` (shadcn CSS variables)
- Modify: `app/package.json` (deps: `@monaco-editor/react`, `react-markdown`, `rehype-highlight`, `highlight.js`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `@radix-ui/react-tabs`, `@radix-ui/react-slot`)

---

## Task 1: Cases asset pipeline (extend `tools/build-manifest.ts`)

**Files:**
- Modify: `tools/build-manifest.ts`
- Modify: `app/.gitignore` (add `public/data/`)
- Modify: `tools/build-manifest.test.ts` (optional: add a small unit test on the case-listing helper)

The build script already validates `meta.json`. Extend it to:
1. List each question's `cases/` directory; copy every `.in` and `.out` file to `app/public/data/questions/<id>/cases/`.
2. Copy `statement.md` to `app/public/data/questions/<id>/statement.md`.
3. Add `caseList: { id: string; visibility: 'sample'|'generated'|'community'|'hidden' }[]` to each question's manifest entry so the SPA knows what cases exist without a separate fetch.

- [ ] **Step 1: Update `tools/build-manifest.ts`**

Add these helpers and integrate them into the existing `emitManifest` / `main` flow. Use Edit tool against the current file — preserve existing zod schemas and `computeBuildTimeScore`.

```ts
// add near the top, with other constants:
const APP_PUBLIC_DATA = join(REPO_ROOT, 'app', 'public', 'data', 'questions')

// type the case list — keep in sync with app/src/data/schema.ts when added
interface CaseRef {
  id: string                                          // filename stem, e.g. 'sample-01'
  visibility: 'sample' | 'generated' | 'community' | 'hidden'
}

function classifyCase(filename: string): CaseRef['visibility'] {
  // filename is like 'sample-01.in' — base is 'sample-01'
  if (filename.startsWith('sample-')) return 'sample'
  if (filename.startsWith('generated-')) return 'generated'
  if (filename.startsWith('community-')) return 'community'
  if (filename.startsWith('hidden-')) return 'hidden'
  // Unknown prefix — default to hidden so unfamiliar files aren't displayed.
  return 'hidden'
}

function listCases(qid: string): CaseRef[] {
  const dir = join(QUESTIONS_DIR, qid, 'cases')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
  const inFiles = files.filter((f) => f.endsWith('.in'))
  return inFiles
    .map((f) => {
      const stem = f.slice(0, -'.in'.length)
      const outFile = `${stem}.out`
      if (!files.includes(outFile)) {
        throw new Error(`Case ${qid}/${stem} has .in but no .out`)
      }
      return { id: stem, visibility: classifyCase(stem) }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function copyQuestionAssets(qid: string) {
  const srcDir = join(QUESTIONS_DIR, qid)
  const dstDir = join(APP_PUBLIC_DATA, qid)
  mkdirSync(join(dstDir, 'cases'), { recursive: true })
  // statement.md
  const stmt = join(srcDir, 'statement.md')
  if (existsSync(stmt)) copyFileSync(stmt, join(dstDir, 'statement.md'))
  // every .in / .out
  const casesSrc = join(srcDir, 'cases')
  if (existsSync(casesSrc)) {
    for (const f of readdirSync(casesSrc)) {
      if (f.endsWith('.in') || f.endsWith('.out')) {
        copyFileSync(join(casesSrc, f), join(dstDir, 'cases', f))
      }
    }
  }
}
```

Add the imports needed:

```ts
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
```

In `main()`, after listing questions, call `copyQuestionAssets(qid)` for each. In `emitManifest`, augment each `enriched` entry with a `caseList` field by calling `listCases(qid)`.

Update the `QuestionMetaSchema` (in `tools/build-manifest.ts`) to optionally accept `caseList`:

Actually no — `caseList` is **derived** from the filesystem, not from `meta.json`. It should NOT be in the validated schema. Instead, it's added during emit. The emitted `manifest.gen.ts` types it via a derived shape.

To keep TypeScript happy on the app side, the app's `QuestionMeta` type (in `app/src/data/schema.ts`) should ALSO get an optional `caseList?: CaseRef[]` field — but as a runtime-derived addition, not a zod-validated input. Or define a separate `QuestionManifestEntry = QuestionMeta & { caseList: CaseRef[] }`.

The cleaner approach: introduce `QuestionManifestEntry` in `app/src/data/schema.ts`:

```ts
export interface CaseRef {
  id: string
  visibility: 'sample' | 'generated' | 'community' | 'hidden'
}

export type QuestionManifestEntry = QuestionMeta & { caseList: readonly CaseRef[] }
```

And in `tools/build-manifest.ts` change the emit:

```ts
export const questions: readonly QuestionManifestEntry[] = ...
```

And update the existing `app/src/data/manifest.gen.ts` import in `QuestionList.tsx` etc. to use the new type — the existing `QuestionMeta` references still work because `QuestionManifestEntry extends QuestionMeta`.

- [ ] **Step 2: Update `app/src/data/schema.ts`** — add `CaseRef` and `QuestionManifestEntry`

```ts
// append at the end of the file
export interface CaseRef {
  id: string
  visibility: 'sample' | 'generated' | 'community' | 'hidden'
}

export type QuestionManifestEntry = QuestionMeta & {
  caseList: readonly CaseRef[]
}
```

- [ ] **Step 3: Update `app/.gitignore`** to ignore the copied public/data directory

Append:

```
# Copied from data/questions/ by tools/build-manifest.ts
public/data/
```

- [ ] **Step 4: Run the manifest builder**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm build-manifest
```

Expected output (text may vary):
```
Wrote app/src/data/manifest.gen.ts (3 questions)
```

Plus `app/public/data/questions/<id>/{statement.md, cases/sample-01.in, cases/sample-01.out}` should now exist.

Verify:

```powershell
$dir = 'd:\GitHub\GPE-Practice\app\public\data\questions'
Get-ChildItem $dir -Recurse | Measure-Object | Select-Object Count
Get-ChildItem $dir
```

Expected: 3 question directories, each with `statement.md` + `cases/` subdir.

- [ ] **Step 5: Inspect the generated `manifest.gen.ts`** and confirm it has `caseList: [{id:'sample-01', visibility:'sample'}]` for each question.

```powershell
Get-Content d:\GitHub\GPE-Practice\app\src\data\manifest.gen.ts -Raw | Select-String -Pattern 'caseList'
```

Should match for each question.

- [ ] **Step 6: Verify lint + build + test still pass**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

If `manifest.gen.ts`'s emitted shape doesn't satisfy `QuestionManifestEntry[]`, TypeScript will error during `tsc -b`. Fix the emitter or the type. Don't loosen either to "as any".

Note: existing `QuestionList.tsx` reads `questions` typed as `readonly QuestionMeta[]`. Since `QuestionManifestEntry extends QuestionMeta`, this should still typecheck. If it doesn't, update `QuestionList.tsx` to import `QuestionManifestEntry` instead.

- [ ] **Step 7: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/build-manifest.ts app/src/data/schema.ts app/.gitignore
git commit -m "feat(tools): copy question statements + cases into app/public/data/ at build time"
```

---

## Task 2: COOP/COEP headers for dev server

**Files:**
- Modify: `app/vite.config.ts`

In production, the COI service worker (Phase 3 Task 4) injects COOP/COEP. In dev, the SW registers on first load but Vite's dev server doesn't send the headers natively, so the first reload required by the SW can be flaky. Set the headers directly in dev for smoother local testing.

- [ ] **Step 1: Edit `app/vite.config.ts`** to add `server.headers`

Use the Edit tool. Find the existing `defineConfig({...})` block. Add a `server` section:

```ts
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
},
```

After the change, the config should look roughly like:

```ts
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 2: Smoke-test the dev server still serves the app**

```powershell
cd d:\GitHub\GPE-Practice\app
$proc = Start-Process -PassThru -NoNewWindow pnpm -ArgumentList 'dev'
Start-Sleep -Seconds 8
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 10
  # Verify the COOP header is set
  if ($r.Headers['Cross-Origin-Opener-Policy'] -eq 'same-origin') {
    Write-Host 'COOP PASS'
  } else { Write-Host 'COOP MISSING'; exit 1 }
  if ($r.Headers['Cross-Origin-Embedder-Policy'] -eq 'require-corp') {
    Write-Host 'COEP PASS'
  } else { Write-Host 'COEP MISSING'; exit 1 }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue
}
```

Note: COEP `require-corp` will block any cross-origin fetch lacking `Cross-Origin-Resource-Policy`. Our `app/public/emception/` is same-origin so it's fine. If anything fetched cross-origin breaks during dev, switch to `credentialless` instead of `require-corp` — but only if needed.

- [ ] **Step 3: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/vite.config.ts
git commit -m "feat(app): COOP/COEP headers in vite dev server for SharedArrayBuffer"
```

---

## Task 3: shadcn/ui foundation (Tabs + Button + utils)

**Files:**
- Modify: `app/package.json` (add `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `@radix-ui/react-tabs`, `@radix-ui/react-slot`, `lucide-react`)
- Modify: `app/tailwind.config.ts`
- Modify: `app/src/index.css`
- Create: `app/src/lib/utils.ts`
- Create: `app/src/components/ui/tabs.tsx`
- Create: `app/src/components/ui/button.tsx`

shadcn/ui is "copy-paste components" so we won't run `npx shadcn init` — we'll write the small handful of components we need directly. Vendoring is the spirit of shadcn.

- [ ] **Step 1: Add deps**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add class-variance-authority@^0.7.0 clsx@^2.1.1 tailwind-merge@^2.5.4 tailwindcss-animate@^1.0.7 @radix-ui/react-tabs@^1.1.1 @radix-ui/react-slot@^1.1.0 lucide-react@^0.453.0
```

- [ ] **Step 2: Create `app/src/lib/utils.ts`** — the shadcn `cn` helper

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Update `app/tailwind.config.ts`** to wire shadcn theme tokens

Replace the existing file:

```ts
import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    container: { center: true, padding: '2rem' },
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang TC',
          'Microsoft JhengHei',
          'sans-serif',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
```

- [ ] **Step 4: Update `app/src/index.css`** to add the CSS variables

Replace the existing file:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  html {
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC',
      'Microsoft JhengHei', sans-serif;
  }
}
```

- [ ] **Step 5: Create `app/src/components/ui/button.tsx`** — verbatim shadcn Button

```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
```

- [ ] **Step 6: Create `app/src/components/ui/tabs.tsx`** — verbatim shadcn Tabs

```tsx
import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName
```

- [ ] **Step 7: Verify lint + build + tests still pass**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

Common pitfall: if Tailwind doesn't recognize the new color tokens (e.g., `bg-primary`), you'll get class-name warnings but the build will still produce output. Inspect `dist/assets/*.css` and confirm `--primary` etc. variables are emitted.

- [ ] **Step 8: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/tailwind.config.ts app/src/index.css app/src/lib/utils.ts app/src/components/ui/
git commit -m "feat(app): shadcn/ui foundation — Button + Tabs + theme tokens"
```

---

## Task 4: Monaco editor wrapper

**Files:**
- Create: `app/src/ide/MonacoEditor.tsx`
- Modify: `app/package.json` (add `@monaco-editor/react`)

- [ ] **Step 1: Add dep**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add @monaco-editor/react@^4.6.0 monaco-editor@^0.52.0
```

`@monaco-editor/react` already loads `monaco-editor` lazily from CDN by default. We pin both versions so behavior is reproducible.

- [ ] **Step 2: Create `app/src/ide/MonacoEditor.tsx`**

```tsx
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

// Lazy-load Monaco — it's ~2MB gz and we don't want it on the question list page.
const Editor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
)

interface MonacoEditorProps {
  value: string
  onChange: (next: string) => void
  language?: string                    // default 'cpp'
  height?: string                      // default '100%'
  theme?: 'light' | 'vs-dark'          // default 'vs-dark'
  options?: Record<string, unknown>    // pass-through to Monaco
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
```

- [ ] **Step 3: Verify build still passes**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm build
```

`pnpm build` will produce a separate `monaco`-related chunk. Inspect `dist/assets/` — should see something like `Editor-<hash>.js` separate from the main bundle.

- [ ] **Step 4: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/src/ide/
git commit -m "feat(ide): lazy-loaded Monaco editor wrapper (~2MB chunk-split)"
```

---

## Task 5: Question-data hook + orchestrator

**Files:**
- Create: `app/src/ide/useQuestionData.ts`
- Create: `app/src/ide/runJudge.ts`
- Create: `app/src/ide/runJudge.test.ts`
- Modify: `app/src/i18n/zh-Hant.json` (add IDE strings)
- Modify: `app/src/store/ide.ts` (add `tabMode`, submission history)

- [ ] **Step 1: Extend `app/src/i18n/zh-Hant.json`** — add an `ide` block

Use Edit. Insert this object next to the existing `questionList`, `settings`, `notFound`, etc. (do NOT remove any existing keys):

```json
"ide": {
  "tabs": {
    "practice": "Practice",
    "examMode": "Exam Mode"
  },
  "buttons": {
    "run": "▶ 執行",
    "submit": "✓ 提交",
    "running": "編譯中…",
    "showProblem": "👁 顯示題目",
    "hideProblem": "🙈 隱藏題目"
  },
  "panes": {
    "problem": "題目",
    "code": "程式碼",
    "testcases": "測資",
    "output": "輸出",
    "submissions": "歷史紀錄"
  },
  "verdict": {
    "AC": "通過",
    "WA": "答案錯誤",
    "TLE": "執行超時",
    "RE": "執行錯誤",
    "CE": "編譯錯誤",
    "PENDING": "等待中"
  },
  "examChrome": {
    "menu": ["檔案", "編輯", "檢視", "建置", "說明"],
    "buildStatus": "Build status",
    "lineCol": "行 {{line}}, 欄 {{col}}",
    "config": "Release",
    "buildLog": "建置日誌"
  },
  "loading": {
    "compiler": "正在初始化 emception（首次載入約 1 分鐘）…",
    "statement": "載入題目中…"
  },
  "errors": {
    "compileFailed": "編譯失敗",
    "noCasesVisible": "目前沒有可見的測資。請新增測資或開啟隱藏測資。"
  }
}
```

- [ ] **Step 2: Extend `app/src/store/ide.ts`** — add `tabMode` + submission history

Use Edit. Find the current `IdeState` interface + store impl. Add new state fields:

```ts
export type TabMode = 'practice' | 'exam'

export interface SubmissionRecord {
  at: number                   // Date.now()
  optimization: 'O0' | 'O2'
  // Per-case verdicts
  perCase: Record<string, Verdict>
  overall: 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'
  compileMs: number
  totalRunMs: number
}

// In IdeState:
tabMode: TabMode
submissions: Record<string, SubmissionRecord[]>   // questionId -> history
setTabMode: (mode: TabMode) => void
appendSubmission: (questionId: string, record: SubmissionRecord) => void
clearSubmissions: (questionId: string) => void

// In the persist `partialize`, include tabMode and submissions:
partialize: (state) => ({
  source: state.source,
  results: state.results,
  favorites: state.favorites,
  tabMode: state.tabMode,
  submissions: state.submissions,
}),
```

The full updated store (use Edit with the existing content as old_string):

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Verdict = 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'

export type TabMode = 'practice' | 'exam'

export interface SubmissionRecord {
  at: number
  optimization: 'O0' | 'O2'
  perCase: Record<string, Verdict>
  overall: 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'
  compileMs: number
  totalRunMs: number
}

export interface IdeState {
  source: Record<string, string>
  results: Record<string, Record<string, Verdict>>
  favorites: Record<string, true>
  submissions: Record<string, SubmissionRecord[]>
  tabMode: TabMode
  isRunning: boolean
  setSource: (questionId: string, src: string) => void
  setResult: (questionId: string, caseId: string, verdict: Verdict) => void
  setRunning: (running: boolean) => void
  toggleFavorite: (questionId: string) => void
  isFavorite: (questionId: string) => boolean
  hasPassed: (questionId: string) => boolean
  setTabMode: (mode: TabMode) => void
  appendSubmission: (questionId: string, record: SubmissionRecord) => void
  clearSubmissions: (questionId: string) => void
}

export const useIdeStore = create<IdeState>()(
  persist(
    (set, get) => ({
      source: {},
      results: {},
      favorites: {},
      submissions: {},
      tabMode: 'practice',
      isRunning: false,
      setSource: (questionId, src) =>
        set((s) => ({ source: { ...s.source, [questionId]: src } })),
      setResult: (questionId, caseId, verdict) =>
        set((s) => ({
          results: {
            ...s.results,
            [questionId]: { ...(s.results[questionId] ?? {}), [caseId]: verdict },
          },
        })),
      setRunning: (running) => set({ isRunning: running }),
      toggleFavorite: (questionId) =>
        set((s) => {
          const next = { ...s.favorites }
          if (next[questionId]) delete next[questionId]
          else next[questionId] = true
          return { favorites: next }
        }),
      isFavorite: (questionId) => !!get().favorites[questionId],
      hasPassed: (questionId) => {
        const r = get().results[questionId]
        if (!r) return false
        return Object.values(r).some((v) => v === 'AC')
      },
      setTabMode: (mode) => set({ tabMode: mode }),
      appendSubmission: (questionId, record) =>
        set((s) => ({
          submissions: {
            ...s.submissions,
            [questionId]: [...(s.submissions[questionId] ?? []), record].slice(-50),
          },
        })),
      clearSubmissions: (questionId) =>
        set((s) => {
          const next = { ...s.submissions }
          delete next[questionId]
          return { submissions: next }
        }),
    }),
    {
      name: 'gpe-ide-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        source: state.source,
        results: state.results,
        favorites: state.favorites,
        submissions: state.submissions,
        tabMode: state.tabMode,
      }),
    },
  ),
)
```

- [ ] **Step 3: Create `app/src/ide/useQuestionData.ts`**

```ts
import { useEffect, useState } from 'react'
import type { QuestionManifestEntry, CaseRef } from '@/data/schema'
import { questions } from '@/data/manifest.gen'

export interface CaseData extends CaseRef {
  stdin: string
  expected: string
}

export interface QuestionData {
  meta: QuestionManifestEntry
  statementMd: string
  cases: CaseData[]
}

export type QuestionLoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: QuestionData }

async function loadQuestionData(meta: QuestionManifestEntry): Promise<QuestionData> {
  const base = `${import.meta.env.BASE_URL}data/questions/${meta.id}`
  const stmtUrl = `${base}/statement.md`
  const stmt = await fetch(stmtUrl).then((r) => {
    if (!r.ok) throw new Error(`statement.md: HTTP ${r.status}`)
    return r.text()
  })
  const cases: CaseData[] = await Promise.all(
    meta.caseList.map(async (c) => {
      const inUrl = `${base}/cases/${c.id}.in`
      const outUrl = `${base}/cases/${c.id}.out`
      const [stdin, expected] = await Promise.all([
        fetch(inUrl).then((r) => r.text()),
        fetch(outUrl).then((r) => r.text()),
      ])
      return { ...c, stdin, expected }
    }),
  )
  return { meta, statementMd: stmt, cases }
}

export function useQuestionData(id: string | undefined): QuestionLoadState {
  const [state, setState] = useState<QuestionLoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    if (!id) {
      setState({ kind: 'error', message: 'Missing question id' })
      return
    }
    const meta = questions.find((q) => q.id === id) as QuestionManifestEntry | undefined
    if (!meta) {
      setState({ kind: 'error', message: `Unknown question: ${id}` })
      return
    }
    loadQuestionData(meta)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: 'error', message: (e as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return state
}
```

- [ ] **Step 4: Create `app/src/ide/runJudge.ts`** — orchestrator that compiles, runs all cases, judges, and produces a SubmissionRecord

```ts
import { defaultCompiler, defaultRuntime, judge, type Verdict, type CompileOpts } from '@/engine'
import type { QuestionManifestEntry } from '@/data/schema'
import type { CaseData } from './useQuestionData'
import type { SubmissionRecord } from '@/store'

export interface RunRequest {
  meta: QuestionManifestEntry
  source: string
  cases: CaseData[]                  // which cases to evaluate
  optimization: CompileOpts['optimization']
}

export type RunResult =
  | {
      kind: 'compile-error'
      stderr: string
      diagnostics: { severity: string; message: string; line?: number; column?: number }[]
      compileMs: number
    }
  | {
      kind: 'graded'
      perCase: Record<string, { verdict: Verdict; stdout: string; stderr: string; ms: number }>
      overall: SubmissionRecord['overall']
      compileMs: number
      totalRunMs: number
      cacheHit: boolean
    }

export async function runJudge(req: RunRequest): Promise<RunResult> {
  const compileResult = await defaultCompiler.compile(req.source, {
    optimization: req.optimization,
  })
  if (!compileResult.ok) {
    return {
      kind: 'compile-error',
      stderr: compileResult.stderr,
      diagnostics: compileResult.diagnostics,
      compileMs: compileResult.ms,
    }
  }

  const perCase: Record<string, { verdict: Verdict; stdout: string; stderr: string; ms: number }> = {}
  let allRunMs = 0
  let overall: SubmissionRecord['overall'] = 'AC'

  for (const c of req.cases) {
    const run = await defaultRuntime.run(compileResult.wasm, c.stdin, req.meta.timeLimitMs)
    allRunMs += run.ms
    if (run.kind === 'tle') {
      perCase[c.id] = { verdict: 'TLE', stdout: run.partialStdout, stderr: run.partialStderr, ms: run.ms }
      overall = overall === 'AC' ? 'TLE' : overall
      continue
    }
    if (run.kind === 'crash') {
      perCase[c.id] = { verdict: 'RE', stdout: '', stderr: run.stderr, ms: run.ms }
      overall = overall === 'AC' ? 'RE' : overall
      continue
    }
    // run.kind === 'ok'
    if (run.exitCode !== 0) {
      perCase[c.id] = { verdict: 'RE', stdout: run.stdout, stderr: run.stderr, ms: run.ms }
      overall = overall === 'AC' ? 'RE' : overall
      continue
    }
    const v = judge({ expected: c.expected, actual: run.stdout, mode: req.meta.judge })
    perCase[c.id] = { verdict: v, stdout: run.stdout, stderr: run.stderr, ms: run.ms }
    if (v === 'WA' && overall === 'AC') overall = 'WA'
  }

  return {
    kind: 'graded',
    perCase,
    overall,
    compileMs: compileResult.ms,
    totalRunMs: allRunMs,
    cacheHit: compileResult.cacheHit,
  }
}
```

- [ ] **Step 5: Create `app/src/ide/runJudge.test.ts`** — unit-test the overall-verdict aggregation using a mocked compiler+runtime

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CaseData } from './useQuestionData'

vi.mock('@/engine', async () => {
  return {
    defaultCompiler: { compile: vi.fn() },
    defaultRuntime: { run: vi.fn() },
    judge: vi.fn(({ expected, actual }) => (expected === actual ? 'AC' : 'WA')),
  }
})

import { defaultCompiler, defaultRuntime } from '@/engine'
import { runJudge } from './runJudge'

const meta = {
  id: 'mock',
  title: 'mock',
  gpeYear: 2024, gpeSession: 1, gpeNo: 'X1',
  uvaId: null, uvaName: null,
  tags: [], difficulty: 'easy' as const,
  timeLimitMs: 1000, memLimitMb: 256,
  judge: { mode: 'whitespace' as const },
  generatedSeeds: [],
  stats: { appearanceCount: 0, lastAppearedYear: 2024, acRate: 1, recommendationScore: 0 },
  caseList: [{ id: 's-01', visibility: 'sample' as const }],
}

const cases: CaseData[] = [{ id: 's-01', visibility: 'sample', stdin: '1', expected: '1' }]

beforeEach(() => {
  vi.mocked(defaultCompiler.compile).mockReset()
  vi.mocked(defaultRuntime.run).mockReset()
})

describe('runJudge', () => {
  it('reports compile-error when compiler returns ok:false', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: false, diagnostics: [], stderr: 'syntax error', ms: 100,
    })
    const res = await runJudge({ meta, source: 'bad', cases, optimization: 'O0' })
    expect(res.kind).toBe('compile-error')
    if (res.kind === 'compile-error') expect(res.stderr).toBe('syntax error')
  })

  it('returns graded AC when run output matches expected', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: true, wasm: new Uint8Array(), warnings: [], cacheHit: false, ms: 50,
    })
    vi.mocked(defaultRuntime.run).mockResolvedValue({
      kind: 'ok', stdout: '1', stderr: '', exitCode: 0, ms: 5,
    })
    const res = await runJudge({ meta, source: 'good', cases, optimization: 'O0' })
    expect(res.kind).toBe('graded')
    if (res.kind === 'graded') {
      expect(res.overall).toBe('AC')
      expect(res.perCase['s-01'].verdict).toBe('AC')
    }
  })

  it('returns overall=TLE if any case TLE', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: true, wasm: new Uint8Array(), warnings: [], cacheHit: false, ms: 50,
    })
    vi.mocked(defaultRuntime.run).mockResolvedValue({
      kind: 'tle', partialStdout: '', partialStderr: '', ms: 1000,
    })
    const res = await runJudge({ meta, source: 'slow', cases, optimization: 'O0' })
    if (res.kind === 'graded') expect(res.overall).toBe('TLE')
  })

  it('returns overall=RE if exit code non-zero', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: true, wasm: new Uint8Array(), warnings: [], cacheHit: false, ms: 50,
    })
    vi.mocked(defaultRuntime.run).mockResolvedValue({
      kind: 'ok', stdout: '', stderr: 'segfault', exitCode: 139, ms: 10,
    })
    const res = await runJudge({ meta, source: 'crashy', cases, optimization: 'O0' })
    if (res.kind === 'graded') expect(res.overall).toBe('RE')
  })
})
```

- [ ] **Step 6: Run tests**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

Expected: 4 new tests pass (total = 47).

- [ ] **Step 7: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/i18n/ app/src/store/ide.ts app/src/ide/useQuestionData.ts app/src/ide/runJudge.ts app/src/ide/runJudge.test.ts
git commit -m "feat(ide): question-data hook + compile/run/judge orchestrator + tests"
```

---

## Task 6: Practice + Exam layouts (the meat of the UI)

**Files:**
- Create: `app/src/ide/ProblemStatement.tsx`
- Create: `app/src/ide/TestcasePanel.tsx`
- Create: `app/src/ide/OutputPanel.tsx`
- Create: `app/src/ide/PracticeLayout.tsx`
- Create: `app/src/ide/ExamLayout.tsx`
- Modify: `app/package.json` (add `react-markdown` + `rehype-highlight` + `highlight.js`)

- [ ] **Step 1: Add markdown deps**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add react-markdown@^9.0.1 rehype-highlight@^7.0.1 highlight.js@^11.10.0
```

- [ ] **Step 2: Create `app/src/ide/ProblemStatement.tsx`**

```tsx
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
```

Note: this uses `prose` from `@tailwindcss/typography`. If not yet installed, install it:

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add -D @tailwindcss/typography@^0.5.15
```

Then update `tailwind.config.ts`'s `plugins` array to `[animate, require('@tailwindcss/typography')]`. Since tailwind.config is ESM, use:

```ts
import typography from '@tailwindcss/typography'
// ...
plugins: [animate, typography],
```

- [ ] **Step 3: Create `app/src/ide/TestcasePanel.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseData } from './useQuestionData'

interface Props {
  cases: CaseData[]
  verdicts: Record<string, 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'>
}

export default function TestcasePanel({ cases, verdicts }: Props) {
  const { t } = useTranslation()
  const visible = cases.filter((c) => c.visibility !== 'hidden')
  const [activeId, setActiveId] = useState<string | null>(visible[0]?.id ?? null)
  const active = visible.find((c) => c.id === activeId) ?? null

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground p-2">{t('ide.errors.noCasesVisible')}</p>
  }

  const verdictBadgeClass = (v: string) => {
    switch (v) {
      case 'AC': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'WA': return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'TLE': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'RE': return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 overflow-x-auto p-1 border-b border-border">
        {visible.map((c) => {
          const v = verdicts[c.id] ?? 'PENDING'
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`text-xs rounded px-2 py-1 whitespace-nowrap ${
                c.id === activeId ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              <span>{c.id}</span>
              <span className={`ml-2 px-1 rounded ${verdictBadgeClass(v)}`}>
                {t(`ide.verdict.${v}`)}
              </span>
            </button>
          )
        })}
      </div>
      {active && (
        <div className="flex-1 overflow-auto p-2 grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs font-mono">
          <div>
            <div className="text-muted-foreground mb-1">stdin</div>
            <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{active.stdin}</pre>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">expected stdout</div>
            <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{active.expected}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `app/src/ide/OutputPanel.tsx`**

```tsx
import { useTranslation } from 'react-i18next'

interface CaseOutcome {
  verdict: 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'
  stdout: string
  stderr: string
  ms: number
}

interface Props {
  compileError?: { stderr: string } | null
  perCase: Record<string, CaseOutcome>
  caseIdsOrdered: string[]
}

export default function OutputPanel({ compileError, perCase, caseIdsOrdered }: Props) {
  const { t } = useTranslation()

  if (compileError) {
    return (
      <div className="h-full overflow-auto p-2">
        <div className="text-sm font-semibold text-destructive mb-1">{t('ide.errors.compileFailed')}</div>
        <pre className="bg-muted text-xs p-2 rounded whitespace-pre-wrap font-mono">{compileError.stderr}</pre>
      </div>
    )
  }

  const items = caseIdsOrdered.filter((id) => perCase[id])
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground p-2">—</p>
  }

  return (
    <div className="h-full overflow-auto p-2 space-y-2">
      {items.map((id) => {
        const r = perCase[id]
        return (
          <details key={id} className="rounded border border-border">
            <summary className="cursor-pointer px-2 py-1 text-sm flex items-center justify-between">
              <span className="font-mono">{id}</span>
              <span className="text-xs text-muted-foreground">
                {t(`ide.verdict.${r.verdict}`)} · {r.ms.toFixed(0)} ms
              </span>
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 p-2 text-xs font-mono">
              <div>
                <div className="text-muted-foreground mb-1">stdout</div>
                <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{r.stdout || '(empty)'}</pre>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">stderr</div>
                <pre className="bg-muted p-2 rounded whitespace-pre-wrap break-all">{r.stderr || '(empty)'}</pre>
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Create `app/src/ide/PracticeLayout.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import MonacoEditor from './MonacoEditor'
import ProblemStatement from './ProblemStatement'
import TestcasePanel from './TestcasePanel'
import OutputPanel from './OutputPanel'
import { useIdeStore, type Verdict, type SubmissionRecord } from '@/store'
import { runJudge } from './runJudge'
import type { QuestionData } from './useQuestionData'

interface Props {
  data: QuestionData
}

const DEFAULT_SOURCE = `#include <bits/stdc++.h>
using namespace std;
int main() {
    // TODO: 在這裡撰寫程式碼
    return 0;
}
`

export default function PracticeLayout({ data }: Props) {
  const { t } = useTranslation()
  const qid = data.meta.id
  const source = useIdeStore((s) => s.source[qid] ?? DEFAULT_SOURCE)
  const setSource = useIdeStore((s) => s.setSource)
  const setResult = useIdeStore((s) => s.setResult)
  const appendSubmission = useIdeStore((s) => s.appendSubmission)

  const [running, setRunning] = useState(false)
  const [compileError, setCompileError] = useState<{ stderr: string } | null>(null)
  const [perCase, setPerCase] = useState<Record<string, { verdict: Verdict; stdout: string; stderr: string; ms: number }>>({})

  const visibleCases = data.cases.filter((c) => c.visibility !== 'hidden')

  const verdictsForBadges: Record<string, Verdict> = Object.fromEntries(
    Object.entries(perCase).map(([id, r]) => [id, r.verdict]),
  )

  async function run(opt: 'O0' | 'O2') {
    setRunning(true)
    setCompileError(null)
    setPerCase({})
    try {
      const casesToRun = opt === 'O0' ? visibleCases : data.cases
      const result = await runJudge({ meta: data.meta, source, cases: casesToRun, optimization: opt })
      if (result.kind === 'compile-error') {
        setCompileError({ stderr: result.stderr })
        if (opt === 'O2') {
          const rec: SubmissionRecord = {
            at: Date.now(),
            optimization: opt,
            perCase: {},
            overall: 'CE',
            compileMs: result.compileMs,
            totalRunMs: 0,
          }
          appendSubmission(qid, rec)
        }
        return
      }
      setPerCase(result.perCase)
      for (const [caseId, outcome] of Object.entries(result.perCase)) {
        setResult(qid, caseId, outcome.verdict)
      }
      if (opt === 'O2') {
        const rec: SubmissionRecord = {
          at: Date.now(),
          optimization: opt,
          perCase: Object.fromEntries(
            Object.entries(result.perCase).map(([k, v]) => [k, v.verdict]),
          ),
          overall: result.overall,
          compileMs: result.compileMs,
          totalRunMs: result.totalRunMs,
        }
        appendSubmission(qid, rec)
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-12rem)]">
      <div className="overflow-auto p-3 border border-border rounded">
        <ProblemStatement md={data.statementMd} />
      </div>
      <div className="flex flex-col border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted">
          <div className="text-xs text-muted-foreground">{t('ide.panes.code')} · {data.meta.gpeNo}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={running} onClick={() => run('O0')}>
              {running ? t('ide.buttons.running') : t('ide.buttons.run')}
            </Button>
            <Button size="sm" disabled={running} onClick={() => run('O2')}>
              {t('ide.buttons.submit')}
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor value={source} onChange={(s) => setSource(qid, s)} />
        </div>
        <div className="h-40 border-t border-border">
          <TestcasePanel cases={data.cases} verdicts={verdictsForBadges} />
        </div>
        <div className="h-40 border-t border-border">
          <OutputPanel
            compileError={compileError}
            perCase={perCase}
            caseIdsOrdered={visibleCases.map((c) => c.id)}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `app/src/ide/ExamLayout.tsx`**

A simpler full-screen editor with Code::Blocks-styled chrome. Problem statement hidden behind a peek button.

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import MonacoEditor from './MonacoEditor'
import ProblemStatement from './ProblemStatement'
import { useIdeStore, type Verdict, type SubmissionRecord } from '@/store'
import { runJudge } from './runJudge'
import type { QuestionData } from './useQuestionData'

interface Props {
  data: QuestionData
}

export default function ExamLayout({ data }: Props) {
  const { t } = useTranslation()
  const qid = data.meta.id
  const source = useIdeStore((s) => s.source[qid] ?? '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    \n    return 0;\n}\n')
  const setSource = useIdeStore((s) => s.setSource)
  const setResult = useIdeStore((s) => s.setResult)
  const appendSubmission = useIdeStore((s) => s.appendSubmission)
  const [running, setRunning] = useState(false)
  const [showProblem, setShowProblem] = useState(false)
  const [buildLog, setBuildLog] = useState<string[]>([])

  function log(s: string) { setBuildLog((b) => [...b, s].slice(-200)) }

  async function f9() {
    setRunning(true)
    setBuildLog([`-------- Build: ${data.meta.gpeNo} - Debug --------`])
    try {
      const result = await runJudge({
        meta: data.meta, source, cases: data.cases.filter((c) => c.visibility !== 'hidden'),
        optimization: 'O0',
      })
      if (result.kind === 'compile-error') {
        log(`Compile error:\n${result.stderr}`)
        return
      }
      log(`Compile finished in ${result.compileMs.toFixed(0)} ms`)
      const verdicts: Record<string, Verdict> = {}
      for (const [caseId, r] of Object.entries(result.perCase)) {
        log(`  ${caseId}: ${r.verdict}  (${r.ms.toFixed(0)} ms)`)
        verdicts[caseId] = r.verdict
        setResult(qid, caseId, r.verdict)
      }
      log(`-------- Done. Overall: ${result.overall} --------`)
      const rec: SubmissionRecord = {
        at: Date.now(),
        optimization: 'O0',
        perCase: verdicts,
        overall: result.overall,
        compileMs: result.compileMs,
        totalRunMs: result.totalRunMs,
      }
      appendSubmission(qid, rec)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-8rem)] bg-[#ece9d8] dark:bg-slate-900 text-xs"
      onKeyDown={(e) => { if (e.key === 'F9') { e.preventDefault(); void f9() } }}
      tabIndex={0}
    >
      <div className="px-2 py-1 flex items-center gap-3 border-b border-slate-400/40 bg-gradient-to-b from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900">
        {t('ide.examChrome.menu', { returnObjects: true }) as unknown as string[] /* trick i18next array return */}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowProblem((x) => !x)}>
            {showProblem ? t('ide.buttons.hideProblem') : t('ide.buttons.showProblem')}
          </Button>
          <Button size="sm" disabled={running} onClick={() => void f9()}>
            F9 · {running ? t('ide.buttons.running') : t('ide.buttons.run')}
          </Button>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        {showProblem && (
          <aside className="w-[28rem] overflow-auto p-3 border-r border-slate-400/40 bg-white dark:bg-slate-950">
            <ProblemStatement md={data.statementMd} />
          </aside>
        )}
        <div className="flex-1 min-h-0">
          <MonacoEditor value={source} onChange={(s) => setSource(qid, s)} />
        </div>
      </div>
      <div className="h-40 border-t border-slate-400/40 overflow-auto bg-white dark:bg-slate-950 p-2 font-mono text-[11px]">
        <div className="text-muted-foreground mb-1">{t('ide.examChrome.buildLog')}</div>
        {buildLog.map((line, i) => (<div key={i}>{line}</div>))}
      </div>
    </div>
  )
}
```

NOTE: The `t('ide.examChrome.menu', { returnObjects: true })` returns an array. Rendering it directly works but the menu visual is minimal — left as a follow-up to flesh out into proper menu items.

- [ ] **Step 7: Run lint + build + tests**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All must pass. Tests don't render these layouts — they're integration components.

If TypeScript complains about `t('...', { returnObjects: true })` typing, add `// @ts-expect-error i18next array overload` immediately above the offending line. Don't restructure.

- [ ] **Step 8: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/tailwind.config.ts app/src/ide/
git commit -m "feat(ide): PracticeLayout + ExamLayout + statement + testcase + output panels"
```

---

## Task 7: Wire `QuestionView` route

**Files:**
- Modify: `app/src/routes/QuestionView.tsx`

Replace the placeholder with the real shell — Tabs switching Practice / Exam, fetching `useQuestionData`, rendering one layout based on `tabMode`.

- [ ] **Step 1: Replace `app/src/routes/QuestionView.tsx`**

```tsx
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useIdeStore } from '@/store'
import { useQuestionData } from '@/ide/useQuestionData'
import PracticeLayout from '@/ide/PracticeLayout'
import ExamLayout from '@/ide/ExamLayout'

export default function QuestionView() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const tabMode = useIdeStore((s) => s.tabMode)
  const setTabMode = useIdeStore((s) => s.setTabMode)
  const state = useQuestionData(id)

  if (state.kind === 'loading') {
    return <p className="text-sm text-muted-foreground">{t('ide.loading.statement')}</p>
  }
  if (state.kind === 'error') {
    return <p className="text-sm text-destructive">{state.message}</p>
  }

  const { data } = state
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {data.meta.gpeNo} · {data.meta.title}
        </h1>
        <Tabs value={tabMode} onValueChange={(v) => setTabMode(v as 'practice' | 'exam')}>
          <TabsList>
            <TabsTrigger value="practice">{t('ide.tabs.practice')}</TabsTrigger>
            <TabsTrigger value="exam">{t('ide.tabs.examMode')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tabMode === 'practice' ? <PracticeLayout data={data} /> : <ExamLayout data={data} />}
    </section>
  )
}
```

- [ ] **Step 2: Smoke-test full pipeline (dev server)**

```powershell
cd d:\GitHub\GPE-Practice\app
$proc = Start-Process -PassThru -NoNewWindow pnpm -ArgumentList 'dev'
Start-Sleep -Seconds 8
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 10
  if ($r.Headers['Cross-Origin-Embedder-Policy'] -eq 'require-corp' -and $r.Content -match 'GPE 練習平台') {
    Write-Host 'DEV PASS'
  } else { Write-Host 'DEV FAIL'; exit 1 }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue
}
```

This only verifies the dev server still serves correctly with COOP/COEP. Actually clicking through the IDE requires a browser, which is your manual smoke test (Phase 4 closeout).

- [ ] **Step 3: Lint + test + build**

```powershell
pnpm lint
pnpm test
pnpm build
```

All must pass. Note: build produces a much larger output now (Monaco is split out into its own chunk, ~2 MB gz). Inspect `dist/assets/` — you should see a `monaco-*.js` chunk and a smaller main bundle.

- [ ] **Step 4: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/routes/QuestionView.tsx
git commit -m "feat(routes): wire QuestionView to Practice/Exam tabs with engine-backed Run/Submit"
```

---

## Task 8: Final verify + tag

- [ ] **Step 1: Clean-install + full pipeline**

```powershell
cd d:\GitHub\GPE-Practice\app
Remove-Item -Recurse -Force node_modules, dist, src/data/manifest.gen.ts, public/data -ErrorAction SilentlyContinue
cd d:\GitHub\GPE-Practice\tools
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue

cd d:\GitHub\GPE-Practice\app
pnpm install --frozen-lockfile
cd d:\GitHub\GPE-Practice\tools
pnpm install --frozen-lockfile

cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All must succeed. `pnpm build`'s prebuild step re-populates `public/data/` via `build-manifest`. Verify:

```powershell
Get-ChildItem d:\GitHub\GPE-Practice\app\public\data\questions
```

Should list 3 directories.

- [ ] **Step 2: Manual smoke test (you / the maintainer, not the subagent)**

Spin the dev server and click through manually:

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm dev
```

Open `http://localhost:5173/`:
1. Question list renders (carry-over from Phase 2).
2. Click any question → `/q/<id>` loads, statement renders on the left, Monaco mounts on the right.
3. Click "▶ 執行" → emception initializes (long first time, near-instant on subsequent calls), compile runs, per-case verdict appears.
4. Click "✓ 提交" → runs against all canonical cases including hidden ones, overall verdict appears.
5. Switch to "Exam Mode" tab → full-screen editor with Code::Blocks chrome, F9 triggers a run.

This manual step is the real Phase 4 verification. The subagent can't do it; document it as a Phase-4 closeout note in the commit message.

- [ ] **Step 3: Confirm clean git status**

```powershell
cd d:\GitHub\GPE-Practice
git status
```

Expected: clean. `app/public/data/` and `app/public/emception/` and `app/src/data/manifest.gen.ts` all gitignored.

- [ ] **Step 4: Tag**

```bash
cd d:\GitHub\GPE-Practice
git tag phase-4-ide-shell-complete
git log --oneline -30
```

---

## Definition of Done for Phase 4

- [ ] `app/public/data/questions/<id>/` populated at build time with statement + cases (gitignored).
- [ ] `app/src/data/schema.ts` exposes `CaseRef` + `QuestionManifestEntry`.
- [ ] `app/vite.config.ts` sends COOP/COEP headers in dev.
- [ ] shadcn/ui Button + Tabs + theme tokens land.
- [ ] `app/src/ide/MonacoEditor.tsx` lazy-loads Monaco.
- [ ] `app/src/ide/useQuestionData.ts` fetches statement + cases by id.
- [ ] `app/src/ide/runJudge.ts` orchestrates compile + run + judge; 4 unit tests via mocked compiler/runtime.
- [ ] `PracticeLayout` (split view) + `ExamLayout` (Code::Blocks chrome) both render the same shared state.
- [ ] `QuestionView` wires Tabs for layout switch.
- [ ] Submission history persisted to localStorage.
- [ ] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build` all clean.
- [ ] Tag `phase-4-ide-shell-complete` exists.

After all above, Phase 5 (contribution forms with octokit + PAT) can begin.

---

## What to do if you're stuck

- **`pnpm dev` works but the IDE fails with "Cross-Origin-Embedder-Policy: require-corp" blocking the Monaco CDN load**: `@monaco-editor/react` loads Monaco from `cdn.jsdelivr.net`. Under COEP `require-corp`, that fails. Fix: switch the loader to use the local node_modules copy. Use `loader.config({ paths: { vs: '/node_modules/monaco-editor/min/vs' } })` from `@monaco-editor/react`'s `loader` export in `MonacoEditor.tsx`. Or set COEP to `credentialless` if browser support is acceptable.
- **`statement.md` 404 in dev**: `pnpm build-manifest` (and therefore `pnpm prebuild`) must have run before `pnpm dev`. The `predev` script in `app/package.json` runs it automatically. If `public/data/` is missing, run `pnpm --dir ../tools build-manifest` manually.
- **Emception worker fails to start with "SharedArrayBuffer is not defined"**: COOP/COEP headers aren't reaching the page. Hard-refresh in dev (the COI service worker is bypassed); confirm `vite.config.ts` `server.headers` is intact.
- **Bundle size warning from Vite about chunks > 500 kB**: that's Monaco; expected. Configure `build.chunkSizeWarningLimit: 2000` in `vite.config.ts` if you want to silence the warning.
- **`react-markdown` rendering an empty article**: the markdown has Windows line endings. `react-markdown` handles CRLF fine — but if the file was clobbered, re-run `pnpm --dir ../tools build-manifest`.
