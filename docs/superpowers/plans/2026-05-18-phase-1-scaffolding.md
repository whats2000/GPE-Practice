# Phase 1 — Project Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the React + TypeScript SPA shell at `app/` exactly as defined in the spec's §5 repo layout — Vite + React 18 + TS 5 + Tailwind + shadcn/ui + HashRouter + Zustand + react-i18next (zh-Hant only) + Vitest + ESLint/Prettier, plus the GitHub Pages deploy workflow. End state: empty placeholder routes for `/`, `/q/:id`, `/settings`, all rendering Chinese chrome, with `pnpm dev` and `pnpm test` and `pnpm build` working clean.

**Architecture:** A monorepo-style layout where `app/` is the only thing that ships. The SPA is a HashRouter SPA (avoids GitHub Pages' BrowserRouter 404 dance). i18n is structured so the `zh-Hant.json` is the only locale; adding `en.json` later is mechanical.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3 (current stable), shadcn/ui (Radix-based components), React Router v6 (HashRouter), Zustand, react-i18next, Vitest, ESLint + typescript-eslint strict, Prettier, pnpm.

**Out of scope for Phase 1:** Question data, the Monaco editor, the WASM engine integration, the contribute forms, real CI workflows for question PRs, **shadcn/ui setup** (deferred until Phase 4 when we first need Dialog/Tabs/Button components — `npx shadcn@latest init` is a one-shot setup right before first use). These are Phase 2+.

---

## Files Created/Modified

- Create: entire `app/` subtree per spec §5
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `.gitignore` (add `app/node_modules/`, `app/dist/`)
- Modify: root `README.md` (brief project overview with quick-start)

---

## Task 1: Initialize Vite + React + TypeScript at `app/`

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/tsconfig.node.json`
- Create: `app/vite.config.ts`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/.gitignore`
- Modify: root `.gitignore`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "gpe-practice-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "zustand": "^4.5.5",
    "react-i18next": "^15.1.0",
    "i18next": "^23.16.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.6.2",
    "jsdom": "^25.0.1",
    "eslint": "^9.13.0",
    "@typescript-eslint/parser": "^8.11.0",
    "@typescript-eslint/eslint-plugin": "^8.11.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    "prettier": "^3.3.3"
  }
}
```

- [ ] **Step 2: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `app/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `app/vite.config.ts`**

The `base` is `./` so HashRouter assets resolve correctly when deployed to `whats2000.github.io/GPE-Practice/`.

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 5: Create `app/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GPE 練習平台</title>
  </head>
  <body class="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `app/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 7: Create `app/src/App.tsx`** (placeholder; routing wires up in Task 3)

```tsx
export default function App() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">GPE 練習平台</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        建置中…
      </p>
    </main>
  )
}
```

- [ ] **Step 8: Create `app/src/index.css`** (Tailwind directives land in Task 2; placeholder for now)

```css
/* Tailwind directives added in Task 2 */
:root {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC',
    'Microsoft JhengHei', sans-serif;
}
```

- [ ] **Step 9: Create `app/.gitignore`**

```
node_modules/
dist/
dist-ssr/
*.local
.vite/
.vitest-cache/
```

- [ ] **Step 10: Update root `.gitignore`** to ignore `app/node_modules/` and `app/dist/` too (in case someone runs from repo root)

Append to `d:/GitHub/GPE-Practice/.gitignore`:

```
# App build output
app/node_modules/
app/dist/
```

- [ ] **Step 11: Install dependencies**

```powershell
cd app
pnpm install
```

Expected: `pnpm-lock.yaml` is created, `node_modules/` populated, no peer-dep errors.

If `pnpm` is unavailable, install via `corepack enable && corepack prepare pnpm@9 --activate` first.

- [ ] **Step 12: Smoke-test the dev server**

```powershell
cd app
pnpm dev
```

Expected: Vite reports `Local:   http://localhost:5173/`. Open it manually in a browser — should see "GPE 練習平台 / 建置中…" rendered. Stop the dev server with Ctrl+C.

If this step is run by a subagent that can't open a browser, instead curl the page and check for the heading text:

```powershell
$proc = Start-Process -PassThru -NoNewWindow pnpm -ArgumentList 'dev'
Start-Sleep -Seconds 6
(Invoke-WebRequest -Uri http://localhost:5173/ -UseBasicParsing).Content | Select-String '練習平台'
Stop-Process -Id $proc.Id -Force
```

Expected: the grep finds "練習平台" in the response body.

- [ ] **Step 13: Commit**

```bash
git add app/package.json app/pnpm-lock.yaml app/tsconfig.json app/tsconfig.node.json app/vite.config.ts app/index.html app/src/main.tsx app/src/App.tsx app/src/index.css app/.gitignore .gitignore
git commit -m "feat(app): scaffold Vite + React + TypeScript at app/"
```

---

## Task 2: Add Tailwind CSS

**Files:**
- Modify: `app/package.json` (add Tailwind devDeps)
- Create: `app/tailwind.config.ts`
- Create: `app/postcss.config.js`
- Modify: `app/src/index.css`
- Modify: `app/src/App.tsx` (verify Tailwind classes render)

- [ ] **Step 1: Add Tailwind devDeps**

```powershell
cd app
pnpm add -D tailwindcss@^3.4.14 postcss@^8.4.47 autoprefixer@^10.4.20
```

- [ ] **Step 2: Create `app/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
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
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 3: Create `app/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Replace `app/src/index.css`** with Tailwind directives

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC',
      'Microsoft JhengHei', sans-serif;
  }
}
```

- [ ] **Step 5: Run dev server, verify Tailwind classes apply**

```powershell
cd app
pnpm dev
```

Open `http://localhost:5173/` and verify the title is large + bold + has padding (the existing `text-2xl font-bold` etc. classes should visibly render now). Stop with Ctrl+C.

- [ ] **Step 6: Run typecheck + build to make sure nothing broke**

```powershell
cd app
pnpm build
```

Expected: `dist/` is produced; no TS errors.

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/pnpm-lock.yaml app/tailwind.config.ts app/postcss.config.js app/src/index.css
git commit -m "feat(app): add Tailwind CSS"
```

---

## Task 3: HashRouter + route shells

**Files:**
- Modify: `app/src/App.tsx`
- Create: `app/src/routes/QuestionList.tsx`
- Create: `app/src/routes/QuestionView.tsx`
- Create: `app/src/routes/Settings.tsx`
- Create: `app/src/routes/NotFound.tsx`
- Create: `app/src/components/Layout.tsx`

- [ ] **Step 1: Create `app/src/components/Layout.tsx`** — shared header + content frame

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom'

export default function Layout() {
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
            GPE 練習
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className={isActive('/')}>題目</Link>
            <Link to="/settings" className={isActive('/settings')}>設定</Link>
          </nav>
          <a
            href="https://gpe-helper.setsal.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            原版 GPE-Helper ↗
          </a>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-800 mt-auto">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-slate-500">
          所有測資與題目皆透過 PR 貢獻；資料僅儲存於此瀏覽器。
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/src/routes/QuestionList.tsx`** — placeholder

```tsx
export default function QuestionList() {
  return (
    <section>
      <h1 className="text-2xl font-bold">題目列表</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Phase 2 將加入資料、推薦度排序、搜尋與過濾。
      </p>
    </section>
  )
}
```

- [ ] **Step 3: Create `app/src/routes/QuestionView.tsx`** — placeholder using `:id` param

```tsx
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
```

- [ ] **Step 4: Create `app/src/routes/Settings.tsx`** — placeholder

```tsx
export default function Settings() {
  return (
    <section>
      <h1 className="text-2xl font-bold">設定</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        外觀主題、鍵盤快捷鍵、本機資料匯出 / 匯入。
      </p>
    </section>
  )
}
```

- [ ] **Step 5: Create `app/src/routes/NotFound.tsx`**

```tsx
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
```

- [ ] **Step 6: Replace `app/src/App.tsx`** — wires HashRouter + routes

```tsx
import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import QuestionList from './routes/QuestionList'
import QuestionView from './routes/QuestionView'
import Settings from './routes/Settings'
import NotFound from './routes/NotFound'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<QuestionList />} />
          <Route path="/q/:id" element={<QuestionView />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
```

- [ ] **Step 7: Smoke-test the routes**

```powershell
cd app
pnpm dev
```

Verify in browser (or `Invoke-WebRequest` as in Task 1 Step 12):
- `http://localhost:5173/` → "題目列表"
- `http://localhost:5173/#/q/b056-two-sum` → "題目：b056-two-sum"
- `http://localhost:5173/#/settings` → "設定"
- `http://localhost:5173/#/asdf` → "找不到頁面"

Stop dev server.

- [ ] **Step 8: Run build to confirm everything compiles**

```powershell
cd app
pnpm build
```

Expected: clean build to `dist/`.

- [ ] **Step 9: Commit**

```bash
git add app/src/App.tsx app/src/components/ app/src/routes/
git commit -m "feat(app): add HashRouter + route shells (QuestionList, QuestionView, Settings, 404)"
```

---

## Task 4: Zustand store skeleton

**Files:**
- Create: `app/src/store/index.ts`
- Create: `app/src/store/ide.ts`
- Create: `app/src/store/settings.ts`

- [ ] **Step 1: Create `app/src/store/ide.ts`** — IDE state shared between Practice + Exam Mode

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Verdict = 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'

export interface IdeState {
  source: Record<string, string>          // keyed by questionId
  results: Record<string, Record<string, Verdict>>  // questionId -> caseId -> verdict
  isRunning: boolean
  setSource: (questionId: string, src: string) => void
  setResult: (questionId: string, caseId: string, verdict: Verdict) => void
  setRunning: (running: boolean) => void
}

export const useIdeStore = create<IdeState>()(
  persist(
    (set) => ({
      source: {},
      results: {},
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
    }),
    {
      name: 'gpe-ide-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ source: state.source, results: state.results }),
    },
  ),
)
```

- [ ] **Step 2: Create `app/src/store/settings.ts`** — theme, hotkeys, etc.

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'
export type Hotkeys = 'default' | 'vscode' | 'vim'

export interface SettingsState {
  theme: Theme
  hotkeys: Hotkeys
  setTheme: (theme: Theme) => void
  setHotkeys: (hotkeys: Hotkeys) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      hotkeys: 'default',
      setTheme: (theme) => set({ theme }),
      setHotkeys: (hotkeys) => set({ hotkeys }),
    }),
    {
      name: 'gpe-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
```

- [ ] **Step 3: Create `app/src/store/index.ts`** — barrel export

```ts
export { useIdeStore } from './ide'
export type { IdeState, Verdict } from './ide'
export { useSettingsStore } from './settings'
export type { SettingsState, Theme, Hotkeys } from './settings'
```

- [ ] **Step 4: Verify the build still passes**

```powershell
cd app
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add app/src/store/
git commit -m "feat(app): add Zustand stores for IDE state + settings (persisted to localStorage)"
```

---

## Task 5: i18n with react-i18next + zh-Hant locale

**Files:**
- Create: `app/src/i18n/index.ts`
- Create: `app/src/i18n/zh-Hant.json`
- Modify: `app/src/main.tsx` (load i18n)
- Modify: `app/src/components/Layout.tsx` (use `useTranslation`)
- Modify: `app/src/routes/QuestionList.tsx`, `QuestionView.tsx`, `Settings.tsx`, `NotFound.tsx` (use `useTranslation`)

- [ ] **Step 1: Create `app/src/i18n/zh-Hant.json`** — single locale resource

```json
{
  "common": {
    "appName": "GPE 練習",
    "footer": "所有測資與題目皆透過 PR 貢獻；資料僅儲存於此瀏覽器。",
    "originalSite": "原版 GPE-Helper",
    "back": "返回",
    "loading": "載入中…"
  },
  "nav": {
    "questions": "題目",
    "settings": "設定"
  },
  "questionList": {
    "title": "題目列表",
    "placeholder": "Phase 2 將加入資料、推薦度排序、搜尋與過濾。"
  },
  "questionView": {
    "title": "題目：{{id}}",
    "placeholder": "Phase 4 將加入 Practice / Exam Mode 分頁與 Monaco 編輯器。"
  },
  "settings": {
    "title": "設定",
    "placeholder": "外觀主題、鍵盤快捷鍵、本機資料匯出 / 匯入。"
  },
  "notFound": {
    "title": "找不到頁面",
    "backToList": "回到題目列表"
  }
}
```

- [ ] **Step 2: Create `app/src/i18n/index.ts`**

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhHant from './zh-Hant.json'

void i18n.use(initReactI18next).init({
  resources: { 'zh-Hant': { translation: zhHant } },
  lng: 'zh-Hant',
  fallbackLng: 'zh-Hant',
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 3: Wire i18n into `app/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 4: Replace `app/src/components/Layout.tsx`** to use translations

```tsx
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
```

- [ ] **Step 5: Replace `app/src/routes/QuestionList.tsx`**

```tsx
import { useTranslation } from 'react-i18next'

export default function QuestionList() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('questionList.title')}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {t('questionList.placeholder')}
      </p>
    </section>
  )
}
```

- [ ] **Step 6: Replace `app/src/routes/QuestionView.tsx`**

```tsx
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function QuestionView() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('questionView.title', { id })}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {t('questionView.placeholder')}
      </p>
    </section>
  )
}
```

- [ ] **Step 7: Replace `app/src/routes/Settings.tsx`**

```tsx
import { useTranslation } from 'react-i18next'

export default function Settings() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        {t('settings.placeholder')}
      </p>
    </section>
  )
}
```

- [ ] **Step 8: Replace `app/src/routes/NotFound.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        <Link to="/" className="text-blue-600 hover:underline">
          {t('notFound.backToList')}
        </Link>
      </p>
    </section>
  )
}
```

- [ ] **Step 9: Run dev server, verify text is unchanged (translations resolve correctly)**

```powershell
cd app
pnpm dev
```

Visual check (or `Invoke-WebRequest` grep for "題目列表"). All four routes should look identical to before — string sources are just routed through i18n now.

- [ ] **Step 10: Run build**

```powershell
cd app
pnpm build
```

Expected: clean build, no i18n missing-key warnings.

- [ ] **Step 11: Commit**

```bash
git add app/src/i18n/ app/src/main.tsx app/src/components/Layout.tsx app/src/routes/
git commit -m "feat(app): add react-i18next + zh-Hant locale; route through t()"
```

---

## Task 6: Vitest + a smoke test

**Files:**
- Create: `app/src/test-setup.ts`
- Create: `app/src/__tests__/App.test.tsx`

- [ ] **Step 1: Create `app/src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: Create `app/src/__tests__/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from '../App'

describe('App', () => {
  it('renders the app name in the header', () => {
    render(<App />)
    expect(screen.getByText('GPE 練習')).toBeInTheDocument()
  })

  it('renders the question list as the default route', () => {
    render(<App />)
    expect(screen.getByText('題目列表')).toBeInTheDocument()
  })

  it('shows the footer note about local-first data', () => {
    render(<App />)
    expect(
      screen.getByText(/所有測資與題目皆透過 PR 貢獻/),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test, expect PASS**

```powershell
cd app
pnpm test
```

Expected:
```
 ✓ src/__tests__/App.test.tsx (3 tests)
   ✓ App > renders the app name in the header
   ✓ App > renders the question list as the default route
   ✓ App > shows the footer note about local-first data
```

If any test fails, **stop and report**. Do not modify the test to pass; the test reflects the correct behavior.

- [ ] **Step 4: Commit**

```bash
git add app/src/test-setup.ts app/src/__tests__/
git commit -m "test(app): smoke test that App renders header, default route, footer"
```

---

## Task 7: ESLint + Prettier config

**Files:**
- Create: `app/eslint.config.js`
- Create: `app/.prettierrc.json`
- Create: `app/.prettierignore`

- [ ] **Step 1: Create `app/eslint.config.js`** (flat config, ESLint 9)

```js
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules', '.vite', '.vitest-cache'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Worker: 'readonly',
        WebAssembly: 'readonly',
        SharedArrayBuffer: 'readonly',
        crypto: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
```

- [ ] **Step 2: Add `@eslint/js` devDep**

```powershell
cd app
pnpm add -D @eslint/js
```

- [ ] **Step 3: Create `app/.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

- [ ] **Step 4: Create `app/.prettierignore`**

```
node_modules/
dist/
pnpm-lock.yaml
*.gen.ts
```

- [ ] **Step 5: Run lint, expect clean**

```powershell
cd app
pnpm lint
```

Expected: no errors. If there are errors, fix them in-source (likely just `prefer-const`, unused-var, etc. minor issues).

- [ ] **Step 6: Run prettier --check, then format**

```powershell
cd app
pnpm exec prettier --check .
pnpm format
```

`--check` likely reports formatting differences; `pnpm format` fixes them. Run `prettier --check` again to confirm clean.

- [ ] **Step 7: Commit**

```bash
git add app/eslint.config.js app/.prettierrc.json app/.prettierignore app/package.json app/pnpm-lock.yaml
# Plus any source files that prettier reformatted
git add -u app/src
git commit -m "chore(app): add ESLint flat config + Prettier; reformat sources"
```

---

## Task 8: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Create `.github/workflows/deploy-pages.yml`**

```yaml
name: deploy-pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with: { submodules: false }

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Enable Corepack
        run: corepack enable

      - name: Install dependencies
        working-directory: app
        run: pnpm install --frozen-lockfile

      - name: Type-check + build
        working-directory: app
        run: pnpm build

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify the workflow yaml is syntactically valid**

```powershell
# Quick sanity-parse with yq or pyyaml. If neither installed, skip — GitHub will report errors at runtime.
node -e "console.log(require('fs').readFileSync('.github/workflows/deploy-pages.yml', 'utf8').length, 'bytes')"
```

The build runs on push to main. We do NOT verify the live deployment in this task — that's a manual confirmation step (visit `https://whats2000.github.io/GPE-Practice/` after push and confirm the page loads).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: add GitHub Pages deploy workflow"
```

---

## Task 9: Root README quick-start

**Files:**
- Modify: `d:/GitHub/GPE-Practice/README.md`

- [ ] **Step 1: Check if README.md already exists; create or replace**

```powershell
ls d:/GitHub/GPE-Practice/README.md
```

If it doesn't exist or is empty, create it. If it has content, prepend the new section.

- [ ] **Step 2: Write `README.md`** with this content

```markdown
# GPE-Practice

In-browser C++ practice platform for the Taiwan GPE (General Programming Exam). Rebuilds [GPE-Helper](https://github.com/setsal/GPE-Helper) into a full practice IDE with an in-browser clang+lld toolchain.

**Status:** Phase 1 scaffolding complete. See `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` for the full design.

## Quick start (development)

```bash
cd app
pnpm install
pnpm dev
```

Open `http://localhost:5173/`.

## Other commands

```bash
cd app
pnpm test       # vitest run
pnpm build      # type-check + production build (outputs to app/dist/)
pnpm lint       # eslint
pnpm format     # prettier --write
```

## Architecture overview

- **Static-only** deployment on GitHub Pages — no backend at request time.
- **Auth is contribution-only** — practice and browse never prompt for credentials. Users who want to contribute a question or a test case enter a fine-grained GitHub PAT at the moment of submission.
- **WASM C++ toolchain** ([emception](https://github.com/jprendes/emception) pre-built artifacts) runs entirely in the user's browser.
- **All canonical data updates** flow through pull requests (manually or via GitHub Actions).

See the full [design spec](./docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md) for invariants, journeys, schemas, and CI workflow details.

## Layout

```
app/             # the React + TypeScript SPA (Vite)
data/            # canonical question data — meta.json, statement.md, cases/, generators/, solutions/
docs/            # design specs, spike findings, implementation plans
spike/           # Phase 0 spike harnesses (toolchain evaluation + PAT verification)
third_party/     # git submodules (read-only data sources)
tools/           # build-time scripts (run in CI or by maintainers)
```

## License

(TBD — pick before public launch.)
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add root README with quick-start + architecture overview"
```

---

## Task 10: Final verification

- [ ] **Step 1: Confirm everything works end-to-end from a clean install**

```powershell
cd app
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

All four must complete without errors.

- [ ] **Step 2: Confirm git is clean**

```powershell
cd d:/GitHub/GPE-Practice
git status
```

Expected: working tree clean.

- [ ] **Step 3: Tag the phase completion**

```bash
git tag phase-1-scaffolding-complete
```

---

## Definition of Done for Phase 1

- [ ] `app/` directory exists with full Vite + React + TS scaffolding
- [ ] `pnpm install && pnpm dev` from `app/` serves the site at `http://localhost:5173/` showing the zh-Hant chrome
- [ ] All four routes (`/`, `/q/:id`, `/settings`, `404`) render placeholder content via i18n
- [ ] `pnpm lint` is clean
- [ ] `pnpm test` runs the smoke test, all green
- [ ] `pnpm build` produces `app/dist/` cleanly
- [ ] `.github/workflows/deploy-pages.yml` exists; ready to deploy on push to main
- [ ] Root `README.md` documents the quick-start
- [ ] Tag `phase-1-scaffolding-complete` exists

After all above are checked, Phase 2 (data conventions, schemas, question list UI) can begin. The Phase 2 plan will reference `app/` paths and the i18n keys established here.

---

## What to do if you're stuck

- **`pnpm install` fails with peer-dep conflicts**: check Node version. Use Node 20 LTS. If still failing, try `pnpm install --strict-peer-dependencies=false` and document why in the commit message.
- **HashRouter URL doesn't update on click**: verify `vite.config.ts` `base: './'` is set; without it relative imports break during build.
- **Vitest can't find jsdom**: the `environment: 'jsdom'` in `vite.config.ts` only works if `jsdom` is installed (already in devDeps in Task 1).
- **i18n missing-key warnings in console**: the missing key has a typo; cross-reference `zh-Hant.json` keys vs `t('...')` calls in the source.
- **GitHub Pages 404 after deploy**: this is the `BrowserRouter` problem; verify `HashRouter` is in use in `App.tsx`. With HashRouter, URLs look like `whats2000.github.io/GPE-Practice/#/q/b056`.
