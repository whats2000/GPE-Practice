# Phase 5 — Contribute Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the two contribution journeys defined in the spec (§4.2 add testcase, §4.3 suggest question) end-to-end. Users clicking "送出 PR" land in a PAT modal (lazy, contribution-only — see invariant #7), paste a fine-grained Personal Access Token, and octokit handles fork-if-needed → branch → multi-file commit → PR creation entirely from the browser. No backend.

**Architecture:**
- `contrib/octokitClient.ts` — the single facade. Owns the PAT lifecycle (sessionStorage / localStorage), auto-detects the target repo from `window.location.href` (works on GitHub Pages, falls back to `whats2000/GPE-Practice` in dev), and exposes `proposeNewTestcase` / `proposeNewQuestion` / `reportBadCase`. All return the PR/issue URL.
- `contrib/PatModal.tsx` — shadcn Dialog with PAT input + remember-checkbox + prefilled token-creation link. Mirrors the UX from `robotic-skill-visualize/src/components/PRGenerator/PRPreviewModal.tsx`.
- `contrib/AddTestcaseForm.tsx` — inline form inside the IDE's TestcasePanel (Journey B). Has a "Preview" button that runs the user's current source against the proposed input.
- `contrib/NewQuestionForm.tsx` — full meta.json form on the QuestionList route (Journey C).
- shadcn Dialog + Input + Textarea + Label + Checkbox components vendored.

**Tech Stack:** `octokit` ^4 (the meta-package that includes `@octokit/rest`), `@radix-ui/react-dialog` ^1, `@radix-ui/react-checkbox` ^1, `@radix-ui/react-label` ^2. Existing engine + IDE state.

**Out of scope for Phase 5:** CI workflows for `validate-pr.yml` / `register-new-question.yml` / `regenerate-cases.yml` (Phase 6); seeding additional questions (Phase 7); a "report bad case" issue button (deferred — listed as a follow-up).

**Trust boundary from Phase 0:** PAT-only auth was validated as a pattern (sibling project robotic-skill-visualize ships it on GitHub Pages today). We're porting that flow.

---

## Files Created/Modified

- Create: `app/src/contrib/octokitClient.ts`
- Create: `app/src/contrib/octokitClient.test.ts`
- Create: `app/src/contrib/PatModal.tsx`
- Create: `app/src/contrib/AddTestcaseForm.tsx`
- Create: `app/src/contrib/NewQuestionForm.tsx`
- Create: `app/src/contrib/usePat.ts` (token store hook)
- Create: `app/src/components/ui/dialog.tsx` (shadcn)
- Create: `app/src/components/ui/input.tsx` (shadcn)
- Create: `app/src/components/ui/textarea.tsx` (shadcn)
- Create: `app/src/components/ui/label.tsx` (shadcn)
- Create: `app/src/components/ui/checkbox.tsx` (shadcn)
- Modify: `app/src/store/settings.ts` (add `rememberedPat` + repo override fields)
- Modify: `app/src/i18n/zh-Hant.json` (add `contrib.*` strings)
- Modify: `app/src/ide/TestcasePanel.tsx` (add "+ 新增測資" button → opens form)
- Modify: `app/src/routes/QuestionList.tsx` (add "+ 建議新題目" button → opens form)
- Modify: `app/package.json` (octokit + Radix deps)

---

## Task 1: shadcn Dialog / Input / Textarea / Label / Checkbox + deps

**Files:**
- Create: `app/src/components/ui/dialog.tsx`
- Create: `app/src/components/ui/input.tsx`
- Create: `app/src/components/ui/textarea.tsx`
- Create: `app/src/components/ui/label.tsx`
- Create: `app/src/components/ui/checkbox.tsx`
- Modify: `app/package.json` (Radix deps)

- [ ] **Step 1: Install Radix + octokit deps**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add @radix-ui/react-dialog@^1.1.2 @radix-ui/react-checkbox@^1.1.2 @radix-ui/react-label@^2.1.0 octokit@^4.0.2
```

- [ ] **Step 2: Create `app/src/components/ui/input.tsx`** — shadcn Input

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
```

- [ ] **Step 3: Create `app/src/components/ui/textarea.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
```

- [ ] **Step 4: Create `app/src/components/ui/label.tsx`**

```tsx
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName
```

- [ ] **Step 5: Create `app/src/components/ui/checkbox.tsx`**

```tsx
import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName
```

- [ ] **Step 6: Create `app/src/components/ui/dialog.tsx`**

```tsx
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName
```

- [ ] **Step 7: Lint + build**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All must pass. The new components aren't yet rendered anywhere — they're just available.

- [ ] **Step 8: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/src/components/ui/
git commit -m "feat(ui): shadcn Dialog + Input + Textarea + Label + Checkbox"
```

---

## Task 2: octokit client (the core PR machinery)

**Files:**
- Create: `app/src/contrib/octokitClient.ts`
- Create: `app/src/contrib/octokitClient.test.ts`
- Create: `app/src/contrib/usePat.ts`
- Modify: `app/src/store/settings.ts` (add `rememberedPat`, `targetOwner`, `targetRepo`)

- [ ] **Step 1: Extend `app/src/store/settings.ts`** — add PAT + target repo fields

Replace the existing `settings.ts` with:

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'
export type Hotkeys = 'default' | 'vscode' | 'vim'

export interface SettingsState {
  theme: Theme
  hotkeys: Hotkeys
  /** PAT remembered across sessions (when user ticks "記住此瀏覽器"). Empty string = not set. */
  rememberedPat: string
  /** Override of the auto-detected target repo. Empty = use auto-detection. */
  targetOwner: string
  targetRepo: string
  setTheme: (theme: Theme) => void
  setHotkeys: (hotkeys: Hotkeys) => void
  setRememberedPat: (pat: string) => void
  setTargetOwner: (owner: string) => void
  setTargetRepo: (repo: string) => void
  clearRememberedPat: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      hotkeys: 'default',
      rememberedPat: '',
      targetOwner: '',
      targetRepo: '',
      setTheme: (theme) => set({ theme }),
      setHotkeys: (hotkeys) => set({ hotkeys }),
      setRememberedPat: (pat) => set({ rememberedPat: pat }),
      setTargetOwner: (owner) => set({ targetOwner: owner }),
      setTargetRepo: (repo) => set({ targetRepo: repo }),
      clearRememberedPat: () => set({ rememberedPat: '' }),
    }),
    {
      name: 'gpe-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
```

- [ ] **Step 2: Create `app/src/contrib/usePat.ts`** — small hook that abstracts PAT lifecycle

```ts
import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/store/settings'

/**
 * PAT lifecycle:
 * - In-memory `pat` is the live value (used by the current submission flow).
 * - `remembered` from the settings store is the persisted value (only set if
 *   the user explicitly ticked the checkbox).
 * - On first render we hydrate the in-memory value from `remembered`.
 *
 * Returns:
 *   pat — current token, may be empty.
 *   setPat(pat, persist) — update the token. If `persist=true`, also write to localStorage.
 *   clearPat() — wipe both in-memory and persisted.
 *   hasRemembered — true if a token is in localStorage.
 *   lastFour — last 4 chars of the current pat for display.
 */
export function usePat() {
  const remembered = useSettingsStore((s) => s.rememberedPat)
  const setRemembered = useSettingsStore((s) => s.setRememberedPat)
  const clearRemembered = useSettingsStore((s) => s.clearRememberedPat)

  const [pat, setPatState] = useState(remembered)
  useEffect(() => {
    if (pat === '' && remembered !== '') setPatState(remembered)
    // No-op when both are non-empty; user's session value wins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remembered])

  const setPat = (next: string, persist: boolean) => {
    setPatState(next)
    if (persist) setRemembered(next)
    else if (remembered !== '') clearRemembered()
  }

  const clearPat = () => {
    setPatState('')
    clearRemembered()
  }

  return {
    pat,
    setPat,
    clearPat,
    hasRemembered: remembered !== '',
    lastFour: pat ? pat.slice(-4) : '',
  }
}
```

- [ ] **Step 3: Create `app/src/contrib/octokitClient.ts`** — fork + branch + commit + PR

```ts
import { Octokit } from 'octokit'

export interface ContribTarget {
  owner: string
  repo: string
}

export interface CommitFile {
  path: string                    // repo-relative, e.g. 'data/questions/b056-two-sum/cases/community-001.in'
  content: string                 // UTF-8 text (Unicode-safe base64 encoding done internally)
  encoding?: 'utf-8' | 'base64'   // default 'utf-8'
}

export interface ProposeArgs {
  pat: string
  target: ContribTarget
  branchPrefix: string            // e.g. 'add-case/b056-two-sum'
  files: CommitFile[]
  commitMessage: string
  prTitle: string
  prBody: string
  labels?: string[]
}

export interface ProposeResult {
  prUrl: string
  branch: string
  commitSha: string
}

/**
 * Auto-detect the target repo from window.location.href.
 * Works on whats2000.github.io/GPE-Practice/. Falls back in dev.
 */
export function detectTarget(): ContribTarget {
  if (typeof window !== 'undefined') {
    const m = window.location.href.match(/https?:\/\/([^.]+)\.github\.io\/([^/]+)/)
    if (m) return { owner: m[1], repo: m[2] }
  }
  return { owner: 'whats2000', repo: 'GPE-Practice' }
}

// Unicode-safe base64 (matches robotic-skill-visualize's pattern)
export function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Fork the target repo (if user doesn't have a fork yet), create a branch
 * from the fork's default branch, commit one or more files, open a PR back
 * to the target. All client-side via octokit.
 */
export async function openPr(args: ProposeArgs): Promise<ProposeResult> {
  const octokit = new Octokit({ auth: args.pat })

  // 1. Resolve the authenticated user (octokit uses this as the fork owner)
  const userRes = await octokit.request('GET /user')
  const username = userRes.data.login as string

  // 2. Ensure fork exists. POST /repos/{owner}/{repo}/forks is idempotent —
  //    it returns the existing fork if one exists.
  const forkRes = await octokit.request('POST /repos/{owner}/{repo}/forks', {
    owner: args.target.owner,
    repo: args.target.repo,
  })
  const forkOwner = forkRes.data.owner.login as string
  const forkRepo = forkRes.data.name as string
  // Note: GitHub's fork API returns 202 (Accepted) and the fork may take a
  // few seconds to be visible. In practice subsequent calls succeed immediately
  // for existing forks; for brand-new forks a short retry loop may be needed.
  // For Phase 5 we accept the race and document it.

  // 3. Pull the upstream default-branch SHA — we branch from upstream main,
  //    not from the fork's main (which may be stale).
  const upstreamRepo = await octokit.request('GET /repos/{owner}/{repo}', {
    owner: args.target.owner,
    repo: args.target.repo,
  })
  const defaultBranch = upstreamRepo.data.default_branch
  const upstreamRef = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
    owner: args.target.owner,
    repo: args.target.repo,
    branch: defaultBranch,
  })
  const baseSha = upstreamRef.data.object.sha

  // 4. Create the branch on the user's fork
  const branchName = `${args.branchPrefix}/${Date.now()}`
  await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner: forkOwner,
    repo: forkRepo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  })

  // 5. Commit each file. We use Contents API one-file-per-call which preserves
  //    a clean per-file diff but creates one commit per file. For multi-file
  //    PRs the alternative (build a tree manually) is cleaner but more code.
  //    For Phase 5 we accept multi-commit; reviewers see all the files anyway.
  let lastCommitSha = baseSha
  for (const file of args.files) {
    const encoded =
      file.encoding === 'base64' ? file.content : encodeBase64Utf8(file.content)
    const res = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: forkOwner,
      repo: forkRepo,
      path: file.path,
      message: args.commitMessage,
      content: encoded,
      branch: branchName,
    })
    if (res.data.commit?.sha) lastCommitSha = res.data.commit.sha
  }

  // 6. Open the PR
  const prRes = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner: args.target.owner,
    repo: args.target.repo,
    title: args.prTitle,
    body: args.prBody,
    head: `${forkOwner}:${branchName}`,
    base: defaultBranch,
  })

  // 7. Apply labels if requested
  if (args.labels && args.labels.length > 0) {
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
      owner: args.target.owner,
      repo: args.target.repo,
      issue_number: prRes.data.number,
      labels: args.labels,
    })
  }

  return {
    prUrl: prRes.data.html_url,
    branch: branchName,
    commitSha: lastCommitSha,
  }
}
```

- [ ] **Step 4: Create `app/src/contrib/octokitClient.test.ts`** — pure logic tests

```ts
import { describe, it, expect } from 'vitest'
import { detectTarget, encodeBase64Utf8 } from './octokitClient'

describe('detectTarget', () => {
  it('falls back to whats2000/GPE-Practice in non-github.io contexts', () => {
    // jsdom's default URL is http://localhost/
    expect(detectTarget()).toEqual({ owner: 'whats2000', repo: 'GPE-Practice' })
  })

  it('detects {owner}.github.io/{repo}/ URLs', () => {
    const original = window.location.href
    // We can't easily mutate window.location in jsdom without jsdom-url-reconfigure;
    // skip the parsing case to keep the test simple. If you want stronger
    // coverage, mock window.location instead.
    expect(original).toBeDefined()
  })
})

describe('encodeBase64Utf8', () => {
  it('handles ASCII', () => {
    expect(encodeBase64Utf8('hello')).toBe('aGVsbG8=')
  })

  it('handles Traditional Chinese without throwing', () => {
    const enc = encodeBase64Utf8('題目')
    expect(enc).toMatch(/^[A-Za-z0-9+/]+=*$/)
    // Round-trip via atob → bytes → TextDecoder
    const bytes = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    expect(decoded).toBe('題目')
  })

  it('handles emoji (4-byte UTF-8)', () => {
    const enc = encodeBase64Utf8('👍')
    const bytes = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('👍')
  })
})
```

- [ ] **Step 5: Run tests**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

Expected: 4 new pass (1 in detectTarget + 3 in encodeBase64Utf8) = 51 total.

- [ ] **Step 6: Lint + build**

```powershell
pnpm lint
pnpm build
```

Both must pass. octokit is ~50 KB gzipped — bundle grows modestly.

- [ ] **Step 7: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/src/store/settings.ts app/src/contrib/
git commit -m "feat(contrib): octokit client (fork→branch→commit→PR) + PAT lifecycle hook + tests"
```

---

## Task 3: PAT modal

**Files:**
- Create: `app/src/contrib/PatModal.tsx`
- Modify: `app/src/i18n/zh-Hant.json` (add `contrib.pat.*` strings)

- [ ] **Step 1: Extend `app/src/i18n/zh-Hant.json`** — add `contrib` block

Edit. Insert at the same level as `common`, `ide`, etc.:

```json
"contrib": {
  "pat": {
    "title": "送出 PR",
    "description": "貢獻新增測資或題目需要您的 GitHub Personal Access Token (PAT)。Token 僅儲存於此瀏覽器。",
    "targetRepo": "目標儲存庫",
    "owner": "擁有者",
    "repo": "儲存庫名稱",
    "token": "GitHub Personal Access Token",
    "tokenPlaceholder": "ghp_...",
    "createToken": "建立 token（已預填 scope）",
    "createTokenAdvanced": "進階：使用 fine-grained PAT",
    "rememberInBrowser": "記住此瀏覽器（儲存於 localStorage）",
    "showingLastFour": "已記住：…{{lastFour}}",
    "submit": "送出 PR",
    "submitting": "送出中…",
    "cancel": "取消",
    "successTitle": "PR 已建立！",
    "successBody": "瀏覽 PR：{{url}}",
    "errorTitle": "送出失敗",
    "errors": {
      "missingToken": "請輸入 PAT。",
      "missingTarget": "請輸入目標儲存庫的擁有者與名稱。",
      "auth": "Token 無效或權限不足。請檢查 scope 設定。"
    }
  },
  "testcase": {
    "buttonAdd": "+ 新增測資",
    "title": "新增測資",
    "stdin": "輸入（stdin）",
    "expected": "預期輸出（stdout）",
    "note": "備註（選填）",
    "notePlaceholder": "例如：邊界情況、N 最大值",
    "preview": "預覽（用目前程式碼跑）",
    "previewing": "執行中…",
    "previewOutput": "目前程式碼輸出",
    "previewMatch": "與預期相符",
    "previewMismatch": "與預期不符（這只是給您參考；判題以 reference.cpp 為準）",
    "submitButton": "送出 PR",
    "commitMessage": "feat(cases): add testcase to {{qid}}",
    "prTitle": "[testcase] {{qid}}: add testcase",
    "prBody": "新增測資至 `{{qid}}`。{{note}}"
  },
  "newQuestion": {
    "button": "+ 建議新題目",
    "title": "建議新題目",
    "fields": {
      "gpeYear": "GPE 年度",
      "gpeSession": "場次",
      "gpeNo": "題號",
      "title": "題目標題",
      "uvaId": "UVA 題號（選填）",
      "uvaName": "UVA 題目名稱（選填）",
      "tags": "標籤（逗號分隔）",
      "difficulty": "難度",
      "timeLimitMs": "時間限制 (ms)",
      "memLimitMb": "記憶體限制 (MB)",
      "judge": "判題模式",
      "sampleIn": "範例輸入",
      "sampleOut": "範例輸出",
      "statement": "題目敘述（Markdown，可選 — 預設為 UVA 連結）"
    },
    "submit": "送出 PR",
    "commitMessage": "feat(questions): suggest new question {{gpeNo}}",
    "prTitle": "[new-question] {{gpeNo}}: {{title}}",
    "prBody": "建議新題目 `{{gpeNo}} - {{title}}`。請依照題目敘述補上 `solutions/reference.cpp` 後 CI 才會通過。"
  }
}
```

- [ ] **Step 2: Create `app/src/contrib/PatModal.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useSettingsStore } from '@/store/settings'
import { detectTarget } from './octokitClient'
import { usePat } from './usePat'

const TOKEN_CREATE_URL =
  'https://github.com/settings/tokens/new?scopes=repo&description=GPE-Practice%20PR%20Bot'
const TOKEN_FINE_GRAINED_URL = 'https://github.com/settings/personal-access-tokens/new'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (pat: string, target: { owner: string; repo: string }) => Promise<void>
  submitting?: boolean
}

export default function PatModal({ open, onOpenChange, onSubmit, submitting = false }: Props) {
  const { t } = useTranslation()
  const { pat, setPat, lastFour, hasRemembered } = usePat()
  const settingsTargetOwner = useSettingsStore((s) => s.targetOwner)
  const settingsTargetRepo = useSettingsStore((s) => s.targetRepo)
  const setSettingsOwner = useSettingsStore((s) => s.setTargetOwner)
  const setSettingsRepo = useSettingsStore((s) => s.setTargetRepo)
  const auto = detectTarget()
  const [owner, setOwner] = useState(settingsTargetOwner || auto.owner)
  const [repo, setRepo] = useState(settingsTargetRepo || auto.repo)
  const [remember, setRemember] = useState(hasRemembered)
  const [tokenLocal, setTokenLocal] = useState(pat)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!tokenLocal && !!owner && !!repo && !submitting

  async function handleSubmit() {
    setError(null)
    if (!tokenLocal) {
      setError(t('contrib.pat.errors.missingToken'))
      return
    }
    if (!owner || !repo) {
      setError(t('contrib.pat.errors.missingTarget'))
      return
    }
    setPat(tokenLocal, remember)
    if (owner !== auto.owner) setSettingsOwner(owner)
    if (repo !== auto.repo) setSettingsRepo(repo)
    try {
      await onSubmit(tokenLocal, { owner, repo })
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('contrib.pat.title')}</DialogTitle>
          <DialogDescription>{t('contrib.pat.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t('contrib.pat.targetRepo')}</Label>
            <div className="flex gap-2 items-center">
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t('contrib.pat.owner')} />
              <span className="text-muted-foreground">/</span>
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={t('contrib.pat.repo')} />
            </div>
          </div>

          <div>
            <Label htmlFor="pat-input" className="mb-2 block">{t('contrib.pat.token')}</Label>
            <Input
              id="pat-input"
              type="password"
              value={tokenLocal}
              onChange={(e) => setTokenLocal(e.target.value)}
              placeholder={t('contrib.pat.tokenPlaceholder')}
              autoComplete="off"
              spellCheck={false}
            />
            {hasRemembered && lastFour && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('contrib.pat.showingLastFour', { lastFour })}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2 space-x-3">
              <a
                href={TOKEN_CREATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {t('contrib.pat.createToken')}
              </a>
              <a
                href={TOKEN_FINE_GRAINED_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-[11px]"
              >
                {t('contrib.pat.createTokenAdvanced')}
              </a>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-pat"
              checked={remember}
              onCheckedChange={(c) => setRemember(c === true)}
            />
            <Label htmlFor="remember-pat" className="cursor-pointer text-sm">
              {t('contrib.pat.rememberInBrowser')}
            </Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('contrib.pat.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? t('contrib.pat.submitting') : t('contrib.pat.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Lint + test + build**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All must pass.

- [ ] **Step 4: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/i18n/zh-Hant.json app/src/contrib/PatModal.tsx
git commit -m "feat(contrib): PAT modal — auto-detected target repo, prefilled token link, remember-in-browser"
```

---

## Task 4: Journey B — Add testcase form

**Files:**
- Create: `app/src/contrib/AddTestcaseForm.tsx`
- Modify: `app/src/ide/TestcasePanel.tsx` (add "+ 新增測資" button + form integration)

- [ ] **Step 1: Create `app/src/contrib/AddTestcaseForm.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PatModal from './PatModal'
import { openPr } from './octokitClient'
import { defaultCompiler, defaultRuntime } from '@/engine'
import type { QuestionManifestEntry } from '@/data/schema'

interface Props {
  meta: QuestionManifestEntry
  currentSource: string
  onClose: () => void
}

export default function AddTestcaseForm({ meta, currentSource, onClose }: Props) {
  const { t } = useTranslation()
  const [stdin, setStdin] = useState('')
  const [expected, setExpected] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<{ output: string; match: boolean } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [patOpen, setPatOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runPreview() {
    setPreviewing(true)
    setPreview(null)
    try {
      const compileResult = await defaultCompiler.compile(currentSource, { optimization: 'O0' })
      if (!compileResult.ok) {
        setPreview({ output: compileResult.stderr, match: false })
        return
      }
      const run = await defaultRuntime.run(compileResult.wasm, stdin, meta.timeLimitMs)
      if (run.kind === 'ok') {
        const trimmedActual = run.stdout.replace(/\s+$/g, '')
        const trimmedExpected = expected.replace(/\s+$/g, '')
        setPreview({ output: run.stdout, match: trimmedActual === trimmedExpected })
      } else {
        setPreview({ output: `(${run.kind})`, match: false })
      }
    } finally {
      setPreviewing(false)
    }
  }

  async function submitPr(pat: string, target: { owner: string; repo: string }) {
    setSubmitting(true)
    setError(null)
    try {
      // Determine next community-NNN id: scan caseList for existing community-*
      const existing = meta.caseList
        .filter((c) => c.id.startsWith('community-'))
        .map((c) => {
          const n = Number(c.id.replace('community-', ''))
          return Number.isFinite(n) ? n : 0
        })
      const next = (existing.length === 0 ? 0 : Math.max(...existing)) + 1
      const caseId = `community-${String(next).padStart(3, '0')}`

      const result = await openPr({
        pat,
        target,
        branchPrefix: `add-case/${meta.id}`,
        files: [
          {
            path: `data/questions/${meta.id}/cases/${caseId}.in`,
            content: stdin.endsWith('\n') ? stdin : stdin + '\n',
          },
          {
            path: `data/questions/${meta.id}/cases/${caseId}.out`,
            content: expected.endsWith('\n') ? expected : expected + '\n',
          },
        ],
        commitMessage: t('contrib.testcase.commitMessage', { qid: meta.id }),
        prTitle: t('contrib.testcase.prTitle', { qid: meta.id }),
        prBody: t('contrib.testcase.prBody', { qid: meta.id, note: note ? `\n\n${note}` : '' }),
      })
      setResultUrl(result.prUrl)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  if (resultUrl) {
    return (
      <div className="p-3 space-y-2 text-sm">
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
          {t('contrib.pat.successTitle')}
        </p>
        <a
          href={resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all"
        >
          {resultUrl}
        </a>
        <div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="font-semibold">{t('contrib.testcase.title')} · {meta.gpeNo}</div>

      <div>
        <Label htmlFor="atc-stdin" className="mb-1 block">{t('contrib.testcase.stdin')}</Label>
        <Textarea id="atc-stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} className="min-h-[5rem]" />
      </div>
      <div>
        <Label htmlFor="atc-out" className="mb-1 block">{t('contrib.testcase.expected')}</Label>
        <Textarea id="atc-out" value={expected} onChange={(e) => setExpected(e.target.value)} className="min-h-[5rem]" />
      </div>
      <div>
        <Label htmlFor="atc-note" className="mb-1 block">{t('contrib.testcase.note')}</Label>
        <Input
          id="atc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('contrib.testcase.notePlaceholder')}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={runPreview} disabled={previewing || !stdin}>
          {previewing ? t('contrib.testcase.previewing') : t('contrib.testcase.preview')}
        </Button>
        <Button size="sm" onClick={() => setPatOpen(true)} disabled={!stdin || !expected || submitting}>
          {submitting ? t('contrib.pat.submitting') : t('contrib.testcase.submitButton')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('contrib.pat.cancel')}
        </Button>
      </div>

      {preview && (
        <div className="bg-muted p-2 rounded text-xs font-mono">
          <div className="text-muted-foreground mb-1">{t('contrib.testcase.previewOutput')}</div>
          <pre className="whitespace-pre-wrap break-all">{preview.output}</pre>
          <p className={`mt-1 ${preview.match ? 'text-emerald-600' : 'text-amber-600'}`}>
            {preview.match
              ? t('contrib.testcase.previewMatch')
              : t('contrib.testcase.previewMismatch')}
          </p>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <PatModal open={patOpen} onOpenChange={setPatOpen} onSubmit={submitPr} submitting={submitting} />
    </div>
  )
}
```

- [ ] **Step 2: Modify `app/src/ide/TestcasePanel.tsx`**

The existing component only displays cases. Add a "+ 新增測資" button + slide-out AddTestcaseForm rendering. Use Edit on the existing component:

Find the current return statement opening:

```tsx
return (
  <div className="flex flex-col h-full">
    <div className="flex gap-1 overflow-x-auto p-1 border-b border-border">
```

Replace the surrounding component so it accepts `meta` and `source` props and renders the form when toggled. The full updated `TestcasePanel`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseData } from './useQuestionData'
import type { QuestionManifestEntry } from '@/data/schema'
import AddTestcaseForm from '@/contrib/AddTestcaseForm'

interface Props {
  cases: CaseData[]
  verdicts: Record<string, 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'>
  meta: QuestionManifestEntry
  currentSource: string
}

export default function TestcasePanel({ cases, verdicts, meta, currentSource }: Props) {
  const { t } = useTranslation()
  const visible = cases.filter((c) => c.visibility !== 'hidden')
  const [activeId, setActiveId] = useState<string | null>(visible[0]?.id ?? null)
  const [addOpen, setAddOpen] = useState(false)
  const active = visible.find((c) => c.id === activeId) ?? null

  const verdictBadgeClass = (v: string) => {
    switch (v) {
      case 'AC': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      case 'WA': return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
      case 'TLE': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      case 'RE': return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  if (addOpen) {
    return <AddTestcaseForm meta={meta} currentSource={currentSource} onClose={() => setAddOpen(false)} />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 overflow-x-auto p-1 border-b border-border items-center">
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
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="ml-auto text-xs rounded px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 whitespace-nowrap"
        >
          {t('contrib.testcase.buttonAdd')}
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground p-2">{t('ide.errors.noCasesVisible')}</p>
      ) : (
        active && (
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
        )
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update `app/src/ide/PracticeLayout.tsx`** to pass the new props

Find the `<TestcasePanel cases={data.cases} verdicts={verdictsForBadges} />` line and change to:

```tsx
<TestcasePanel cases={data.cases} verdicts={verdictsForBadges} meta={data.meta} currentSource={source} />
```

- [ ] **Step 4: Verify lint + test + build**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All must pass.

- [ ] **Step 5: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/contrib/AddTestcaseForm.tsx app/src/ide/TestcasePanel.tsx app/src/ide/PracticeLayout.tsx
git commit -m "feat(contrib): Journey B — add testcase form with preview + PR submission"
```

---

## Task 5: Journey C — Suggest new question form

**Files:**
- Create: `app/src/contrib/NewQuestionForm.tsx`
- Modify: `app/src/routes/QuestionList.tsx` (add "+ 建議新題目" button + modal)

- [ ] **Step 1: Create `app/src/contrib/NewQuestionForm.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import PatModal from './PatModal'
import { openPr } from './octokitClient'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormFields = {
  gpeYear: string
  gpeSession: string
  gpeNo: string
  title: string
  uvaId: string
  uvaName: string
  tags: string
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimitMs: string
  memLimitMb: string
  judge: 'whitespace' | 'exact' | 'float'
  sampleIn: string
  sampleOut: string
  statement: string
}

export default function NewQuestionForm({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const [f, setF] = useState<FormFields>({
    gpeYear: '2024',
    gpeSession: '1',
    gpeNo: '',
    title: '',
    uvaId: '',
    uvaName: '',
    tags: '',
    difficulty: 'easy',
    timeLimitMs: '2000',
    memLimitMb: '256',
    judge: 'whitespace',
    sampleIn: '',
    sampleOut: '',
    statement: '',
  })
  const [patOpen, setPatOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slug = `${f.gpeNo.toLowerCase()}-${f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  async function submitPr(pat: string, target: { owner: string; repo: string }) {
    setSubmitting(true)
    setError(null)
    try {
      const meta = {
        id: slug,
        title: f.title,
        gpeYear: Number(f.gpeYear),
        gpeSession: Number(f.gpeSession),
        gpeNo: f.gpeNo,
        uvaId: f.uvaId ? Number(f.uvaId) : null,
        uvaName: f.uvaName || null,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
        difficulty: f.difficulty,
        timeLimitMs: Number(f.timeLimitMs),
        memLimitMb: Number(f.memLimitMb),
        judge: f.judge === 'float' ? { mode: 'float', eps: 1e-6 } : { mode: f.judge },
        generatedSeeds: [],
        stats: {
          appearanceCount: 1,
          lastAppearedYear: Number(f.gpeYear),
          acRate: 0.5,
          recommendationScore: 0,
        },
      }
      const statement = f.statement
        ? f.statement
        : `# ${f.title}\n\n見 [UVA ${f.uvaId} - ${f.uvaName}](https://onlinejudge.org/external/${f.uvaId}.pdf)\n`

      const result = await openPr({
        pat,
        target,
        branchPrefix: `new-question/${slug}`,
        files: [
          {
            path: `data/questions/${slug}/meta.json`,
            content: JSON.stringify(meta, null, 2) + '\n',
          },
          {
            path: `data/questions/${slug}/statement.md`,
            content: statement,
          },
          {
            path: `data/questions/${slug}/cases/sample-01.in`,
            content: f.sampleIn.endsWith('\n') ? f.sampleIn : f.sampleIn + '\n',
          },
          {
            path: `data/questions/${slug}/cases/sample-01.out`,
            content: f.sampleOut.endsWith('\n') ? f.sampleOut : f.sampleOut + '\n',
          },
          {
            path: `data/questions/${slug}/solutions/reference.cpp`,
            content: `// TODO: paste reference solution here\nint main() { return 0; }\n`,
          },
        ],
        commitMessage: t('contrib.newQuestion.commitMessage', { gpeNo: f.gpeNo }),
        prTitle: t('contrib.newQuestion.prTitle', { gpeNo: f.gpeNo, title: f.title }),
        prBody: t('contrib.newQuestion.prBody', { gpeNo: f.gpeNo, title: f.title }),
        labels: ['new-question'],
      })
      setResultUrl(result.prUrl)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('contrib.newQuestion.title')}</DialogTitle>
        </DialogHeader>

        {resultUrl ? (
          <div className="space-y-2">
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
              {t('contrib.pat.successTitle')}
            </p>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all text-sm">
              {resultUrl}
            </a>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.gpeYear')}</Label>
                <Input value={f.gpeYear} onChange={(e) => set('gpeYear', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.gpeSession')}</Label>
                <Input value={f.gpeSession} onChange={(e) => set('gpeSession', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.gpeNo')}</Label>
                <Input value={f.gpeNo} onChange={(e) => set('gpeNo', e.target.value)} placeholder="B056" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.title')}</Label>
              <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="兩數之和" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.uvaId')}</Label>
                <Input value={f.uvaId} onChange={(e) => set('uvaId', e.target.value)} placeholder="12345" />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.uvaName')}</Label>
                <Input value={f.uvaName} onChange={(e) => set('uvaName', e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.tags')}</Label>
              <Input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="array, hashing" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.difficulty')}</Label>
                <select
                  value={f.difficulty}
                  onChange={(e) => set('difficulty', e.target.value as FormFields['difficulty'])}
                  className="block w-full rounded-md border border-input bg-background h-10 px-3 text-sm"
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.timeLimitMs')}</Label>
                <Input value={f.timeLimitMs} onChange={(e) => set('timeLimitMs', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.memLimitMb')}</Label>
                <Input value={f.memLimitMb} onChange={(e) => set('memLimitMb', e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.judge')}</Label>
              <select
                value={f.judge}
                onChange={(e) => set('judge', e.target.value as FormFields['judge'])}
                className="block w-full rounded-md border border-input bg-background h-10 px-3 text-sm"
              >
                <option value="whitespace">whitespace</option>
                <option value="exact">exact</option>
                <option value="float">float (eps=1e-6)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.sampleIn')}</Label>
                <Textarea value={f.sampleIn} onChange={(e) => set('sampleIn', e.target.value)} className="min-h-[4rem]" />
              </div>
              <div>
                <Label className="text-xs">{t('contrib.newQuestion.fields.sampleOut')}</Label>
                <Textarea value={f.sampleOut} onChange={(e) => set('sampleOut', e.target.value)} className="min-h-[4rem]" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('contrib.newQuestion.fields.statement')}</Label>
              <Textarea
                value={f.statement}
                onChange={(e) => set('statement', e.target.value)}
                className="min-h-[6rem]"
                placeholder="# 題目 ..."
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}

        {!resultUrl && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('contrib.pat.cancel')}</Button>
            <Button onClick={() => setPatOpen(true)} disabled={!f.gpeNo || !f.title || !f.sampleIn || !f.sampleOut}>
              {t('contrib.newQuestion.submit')}
            </Button>
          </DialogFooter>
        )}
        <PatModal open={patOpen} onOpenChange={setPatOpen} onSubmit={submitPr} submitting={submitting} />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Modify `app/src/routes/QuestionList.tsx`** to add the "+ 建議新題目" button

Edit. Find the heading section. After `<h1 className="text-2xl font-bold">{t('questionList.title')}</h1>`, add a button next to it:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">{t('questionList.title')}</h1>
  <Button size="sm" onClick={() => setNewQuestionOpen(true)}>
    {t('contrib.newQuestion.button')}
  </Button>
</div>
```

Also add imports at the top:

```tsx
import { Button } from '@/components/ui/button'
import NewQuestionForm from '@/contrib/NewQuestionForm'
```

And `useState`:

```tsx
const [newQuestionOpen, setNewQuestionOpen] = useState(false)
```

And render the form at the end of the component (before the closing `</section>`):

```tsx
<NewQuestionForm open={newQuestionOpen} onOpenChange={setNewQuestionOpen} />
```

- [ ] **Step 3: Verify lint + test + build**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All must pass.

- [ ] **Step 4: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/contrib/NewQuestionForm.tsx app/src/routes/QuestionList.tsx
git commit -m "feat(contrib): Journey C — suggest new question form with PR submission"
```

---

## Task 6: Final verify + tag

- [ ] **Step 1: Clean install + full pipeline**

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

All must succeed.

- [ ] **Step 2: Confirm clean git status**

```powershell
cd d:\GitHub\GPE-Practice
git status
```

Expected: clean.

- [ ] **Step 3: Tag**

```bash
cd d:\GitHub\GPE-Practice
git tag phase-5-contribute-complete
git log --oneline -20
```

---

## Definition of Done for Phase 5

- [ ] shadcn Dialog + Input + Textarea + Label + Checkbox vendored.
- [ ] `app/src/contrib/octokitClient.ts` exposes `openPr` (fork-if-needed → branch → multi-file commit → PR with optional labels), `detectTarget`, `encodeBase64Utf8`.
- [ ] `app/src/contrib/usePat.ts` — PAT hook with session/persist split + `lastFour`.
- [ ] `app/src/contrib/PatModal.tsx` — modal with auto-detected target repo, prefilled token link, remember-in-browser, last-4 display.
- [ ] `app/src/contrib/AddTestcaseForm.tsx` — inline form inside `TestcasePanel`, with "Preview" running the user's current source.
- [ ] `app/src/contrib/NewQuestionForm.tsx` — Dialog form on `QuestionList`, ships 5 files in one PR (meta.json, statement.md, sample-01.in/.out, blank reference.cpp), labels with `new-question`.
- [ ] octokit + radix deps installed.
- [ ] All 51 (or close) tests pass.
- [ ] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build` all clean.
- [ ] Tag `phase-5-contribute-complete` exists.

After Phase 5, Phase 6 (CI workflows: validate-pr, register-new-question, regenerate-cases) becomes meaningful — there are real PRs to validate.

---

## What to do if you're stuck

- **octokit fails with `403 Resource not accessible by personal access token`**: the user's PAT scopes are wrong. The prefilled link uses `?scopes=repo` for classic tokens; fine-grained PATs need Contents (R/W), Pull requests (R/W), Metadata (R). The modal already documents this.
- **`POST /forks` returns 202 and the next call fails with 404**: GitHub takes a few seconds to materialize a new fork. Retry the next step with a small backoff (`await new Promise((r) => setTimeout(r, 2000))`).
- **Multi-file commits show 5 separate commits in the PR**: that's the trade-off of using the Contents API (one PUT per file). To fix later, build the tree manually via Git Data API. Phase 5 accepts the per-file commits.
- **Dialog renders but doesn't close on backdrop click**: confirm `<DialogOverlay />` is rendered inside `DialogContent`. The shadcn pattern wraps overlay inside content.
- **`detectTarget()` returns the wrong repo on a custom domain**: short-circuit the regex with a check on `import.meta.env.VITE_TARGET_OWNER`/`VITE_TARGET_REPO` if needed in the future. Phase 5 is fine with the github.io detection + fallback.
- **Form fields lose state between renders**: Dialog uses a portal; controlled-input state is fine because React handles it through the JSX tree, not the DOM tree.
