# Phase 2 — Question Data + List UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the canonical question-data shape on disk, build the manifest pipeline that bakes it into the SPA bundle, implement the 推薦度 (recommendation score) formula, and ship the Question List UI with sort/filter/search routed through i18n. End state: visiting `/` shows a real list of seeded questions, sortable and filterable, with deterministic recommendation scores computed at build time.

**Architecture:**
- Source of truth on disk: `data/questions/<slug>/{meta.json, statement.md, cases/, generators/, solutions/}` per spec §5 / §6.
- A build-time Node script (`tools/build-manifest.ts`) walks `data/questions/`, zod-validates each `meta.json`, computes recommendation scores, and emits `app/src/data/manifest.gen.ts` — a typed module the SPA imports. SPA never reads `data/` at runtime.
- The Question List UI reads `manifest.gen.ts`, applies client-side filters (tag chips, year range, my-status), sort (default: 推薦度 desc), and search (title / GPE id).
- Per-user state (favorites, my-status, hide-passed) lives in Zustand + localStorage.

**Tech Stack:** zod (validation), Node 20 + tsx (manifest builder runs in CI / dev pre-build), Vitest (schema + score unit tests + UI tests with @testing-library/react), existing Tailwind for styling.

**Out of scope for Phase 2:** Real `pybin` stats integration (stub values in seed questions; real data comes in Phase 7 when we migrate from GPE-Helper), the IDE route (Phase 4), the contribute forms (Phase 5), `register-new-question` and `validate-pr` workflows (Phase 6).

---

## Files Created/Modified

- Create: `app/src/data/schema.ts` (zod schemas + types)
- Create: `app/src/lib/recommendationScore.ts` (formula)
- Create: `app/src/lib/recommendationScore.test.ts`
- Create: `app/src/data/schema.test.ts`
- Create: `app/src/data/manifest.gen.ts` (generated; gitignored)
- Create: `app/src/components/QuestionListRow.tsx`
- Create: `app/src/components/StatusBadge.tsx`
- Modify: `app/src/routes/QuestionList.tsx` (real implementation)
- Modify: `app/src/i18n/zh-Hant.json` (add list strings)
- Modify: `app/src/store/ide.ts` (add favorites + my-status helpers; we already track results)
- Modify: `app/.gitignore` (add `src/data/manifest.gen.ts`)
- Modify: `app/package.json` (add `prebuild` script + zod dep + tsx devDep)
- Modify: `app/vite.config.ts` (Vitest config tweak if needed)
- Create: `tools/build-manifest.ts` (CLI, runs in CI + locally)
- Create: `tools/validate-question.ts` (CLI used by CI)
- Create: `tools/tsconfig.json` (Node tooling tsconfig)
- Create: `tools/package.json` (tsx + zod + types)
- Create: `data/questions/b056-two-sum/{meta.json, statement.md, cases/sample-01.in/.out}` (seed 1)
- Create: `data/questions/a013-fibonacci/{meta.json, statement.md, cases/sample-01.in/.out}` (seed 2)
- Create: `data/questions/c027-quicksort-stats/{meta.json, statement.md, cases/sample-01.in/.out}` (seed 3)
- Create: `docs/recommendation-score.md` (formula documentation)

---

## Task 1: zod schema for `QuestionMeta`

**Files:**
- Create: `app/src/data/schema.ts`
- Create: `app/src/data/schema.test.ts`
- Modify: `app/package.json` (add `zod` dep)

- [ ] **Step 1: Add zod dep**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add zod@^3.23.8
```

- [ ] **Step 2: Create `app/src/data/schema.ts`**

```ts
import { z } from 'zod'

export const JudgeModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact') }),
  z.object({ mode: z.literal('whitespace') }),
  z.object({ mode: z.literal('float'), eps: z.number().positive() }),
])

export const DifficultySchema = z.enum(['easy', 'medium', 'hard'])

export const GeneratedSeedSchema = z.object({
  seed: z.number().int().nonnegative(),
  label: z.string().min(1),
})

export const StatsSchema = z.object({
  appearanceCount: z.number().int().nonnegative(),
  lastAppearedYear: z.number().int().min(2000).max(2100),
  acRate: z.number().min(0).max(1),
  recommendationScore: z.number().min(0).max(100),
})

export const QuestionMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case'),
  title: z.string().min(1),
  gpeYear: z.number().int().min(2000).max(2100),
  gpeSession: z.number().int().min(1).max(12),
  gpeNo: z.string().min(1),
  uvaId: z.number().int().positive().nullable(),
  uvaName: z.string().min(1).nullable(),
  tags: z.array(z.string().min(1)),
  difficulty: DifficultySchema,
  timeLimitMs: z.number().int().positive(),
  memLimitMb: z.number().int().positive(),
  judge: JudgeModeSchema,
  generatedSeeds: z.array(GeneratedSeedSchema),
  stats: StatsSchema,
})

export type QuestionMeta = z.infer<typeof QuestionMetaSchema>
export type JudgeMode = z.infer<typeof JudgeModeSchema>
export type Difficulty = z.infer<typeof DifficultySchema>
```

- [ ] **Step 3: Create `app/src/data/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { QuestionMetaSchema } from './schema'

const validMeta = {
  id: 'b056-two-sum',
  title: 'Two Sum',
  gpeYear: 2023,
  gpeSession: 2,
  gpeNo: 'B056',
  uvaId: 12345,
  uvaName: 'UVA - Sum it Up',
  tags: ['array', 'hashing'],
  difficulty: 'easy' as const,
  timeLimitMs: 2000,
  memLimitMb: 256,
  judge: { mode: 'whitespace' as const },
  generatedSeeds: [{ seed: 1, label: 'small' }],
  stats: {
    appearanceCount: 5,
    lastAppearedYear: 2023,
    acRate: 0.62,
    recommendationScore: 78,
  },
}

describe('QuestionMetaSchema', () => {
  it('accepts a fully-valid meta object', () => {
    expect(() => QuestionMetaSchema.parse(validMeta)).not.toThrow()
  })

  it('rejects non-kebab-case ids', () => {
    expect(() =>
      QuestionMetaSchema.parse({ ...validMeta, id: 'NotKebabCase' }),
    ).toThrow(/kebab-case/)
  })

  it('rejects ac rate above 1', () => {
    expect(() =>
      QuestionMetaSchema.parse({
        ...validMeta,
        stats: { ...validMeta.stats, acRate: 1.2 },
      }),
    ).toThrow()
  })

  it('rejects float judge mode without eps', () => {
    expect(() =>
      QuestionMetaSchema.parse({
        ...validMeta,
        judge: { mode: 'float' },
      } as unknown),
    ).toThrow()
  })

  it('accepts null uvaId + uvaName for non-mirrored questions', () => {
    const parsed = QuestionMetaSchema.parse({
      ...validMeta,
      uvaId: null,
      uvaName: null,
    })
    expect(parsed.uvaId).toBeNull()
    expect(parsed.uvaName).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test, expect PASS**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

Expected: 5 schema tests pass + the existing 3 App tests = 8 passing.

- [ ] **Step 5: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/src/data/
git commit -m "feat(app): zod schema for QuestionMeta + tests"
```

---

## Task 2: Recommendation score formula

**Files:**
- Create: `app/src/lib/recommendationScore.ts`
- Create: `app/src/lib/recommendationScore.test.ts`
- Create: `docs/recommendation-score.md`

- [ ] **Step 1: Create `app/src/lib/recommendationScore.ts`**

The formula is per spec §6.3: 40% frequency + 30% recency + 20% difficulty + 10% not-passed bonus (applied client-side only).

```ts
export interface StatsInput {
  appearanceCount: number
  lastAppearedYear: number
  acRate: number
}

export interface CorpusContext {
  maxAppearanceCount: number  // pre-computed across all questions
  currentYear: number
}

/**
 * Build-time portion of the recommendation score.
 * Returns 0..90 (the 10% not-passed bonus is applied client-side, see addNotPassedBonus).
 *
 * Formula:
 *   buildScore = 90 * (
 *     0.40 * normalize(appearanceCount, [0, maxAppearanceCount]) +
 *     0.30 * normalize(currentYear - lastAppearedYear, [0, 10], inverted=true) +
 *     0.20 * normalize(1 - acRate, [0, 1])
 *   )
 *
 * The 0.90 multiplier (not 1.0) leaves headroom for the client-side bonus.
 */
export function computeBuildTimeScore(stats: StatsInput, ctx: CorpusContext): number {
  const freqWeight = 0.4
  const recencyWeight = 0.3
  const difficultyWeight = 0.2

  const freqNorm =
    ctx.maxAppearanceCount > 0 ? stats.appearanceCount / ctx.maxAppearanceCount : 0
  const yearGap = Math.max(0, Math.min(10, ctx.currentYear - stats.lastAppearedYear))
  const recencyNorm = 1 - yearGap / 10
  const difficultyNorm = clamp01(1 - stats.acRate)

  const raw =
    90 * (freqWeight * freqNorm + recencyWeight * recencyNorm + difficultyWeight * difficultyNorm)

  return roundTo(clamp(raw, 0, 90), 1)
}

/**
 * Client-side: add the not-passed bonus if the user hasn't already passed this question.
 * Returns 0..100.
 */
export function addNotPassedBonus(buildScore: number, hasPassed: boolean): number {
  const bonus = hasPassed ? 0 : 10
  return roundTo(clamp(buildScore + bonus, 0, 100), 1)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function clamp01(n: number): number {
  return clamp(n, 0, 1)
}

function roundTo(n: number, decimals: number): number {
  const m = 10 ** decimals
  return Math.round(n * m) / m
}
```

- [ ] **Step 2: Create `app/src/lib/recommendationScore.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { computeBuildTimeScore, addNotPassedBonus } from './recommendationScore'

describe('computeBuildTimeScore', () => {
  const ctx = { maxAppearanceCount: 10, currentYear: 2026 }

  it('returns 0 for a never-appeared, ancient, always-AC question', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 2010, acRate: 1.0 },
      ctx,
    )
    expect(score).toBe(0)
  })

  it('returns 90 (max build score) for a maximally frequent, recent, hardest question', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 10, lastAppearedYear: 2026, acRate: 0.0 },
      ctx,
    )
    expect(score).toBe(90)
  })

  it('weights frequency more than recency more than difficulty', () => {
    const freqOnly = computeBuildTimeScore(
      { appearanceCount: 10, lastAppearedYear: 2016, acRate: 1 },
      ctx,
    )
    const recencyOnly = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 2026, acRate: 1 },
      ctx,
    )
    const difficultyOnly = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 2016, acRate: 0 },
      ctx,
    )
    expect(freqOnly).toBeGreaterThan(recencyOnly)
    expect(recencyOnly).toBeGreaterThan(difficultyOnly)
  })

  it('handles empty corpus gracefully (no division by zero)', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 5, lastAppearedYear: 2026, acRate: 0.5 },
      { maxAppearanceCount: 0, currentYear: 2026 },
    )
    expect(score).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(score)).toBe(true)
  })
})

describe('addNotPassedBonus', () => {
  it('adds 10 if not passed', () => {
    expect(addNotPassedBonus(70, false)).toBe(80)
  })

  it('adds 0 if already passed', () => {
    expect(addNotPassedBonus(70, true)).toBe(70)
  })

  it('clamps to 100', () => {
    expect(addNotPassedBonus(95, false)).toBe(100)
  })
})
```

- [ ] **Step 3: Run tests, expect PASS**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

Expected: 7 new tests pass.

- [ ] **Step 4: Create `docs/recommendation-score.md`** documenting the formula publicly

```markdown
# Recommendation Score (推薦度)

The Question List defaults to sorting by 推薦度 (recommendation score), a 0–100 metric that prioritises questions a student should practice next.

## Formula

```
buildScore = 90 * (
    0.40 * freq_norm       // appearanceCount / maxAppearanceCount in the corpus
  + 0.30 * recency_norm    // 1 - clamp(currentYear - lastAppearedYear, 0, 10) / 10
  + 0.20 * difficulty_norm // 1 - acRate  (lower AC = harder = more worth practising)
)

finalScore = buildScore + (hasPassed ? 0 : 10)   // client-side bonus
```

`buildScore` is computed at build time (in `tools/build-manifest.ts`) and shipped in `meta.json.stats.recommendationScore`. The `+10` not-passed bonus is applied in the browser from `localStorage`, so the same static build serves every user fairly.

## Why these weights

- **Frequency dominates (40%)** — GPE recycles questions across exams. If something appeared 5 times in 5 years, it's overwhelmingly likely to appear again.
- **Recency (30%)** — A question from 2025 is more topical than one from 2018, even at equal frequency.
- **Difficulty (20%)** — Lower AC rate signals a question students struggle with. Practising those gives more value than retreading easy ones.
- **Not-passed bonus (10%)** — Personal: pushes you toward questions you haven't conquered yet without dominating the corpus signal.

## Tuning

This formula is intentionally simple. To revise:

1. Edit `app/src/lib/recommendationScore.ts`.
2. Update `app/src/lib/recommendationScore.test.ts`.
3. Update this document.
4. Re-run `tools/build-manifest.ts` to refresh shipped scores.
5. Open a PR.

There is no "right" formula — this is a heuristic. Open issues if you have a better one.
```

- [ ] **Step 5: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/lib/ docs/recommendation-score.md
git commit -m "feat(app): recommendation score formula + tests + docs"
```

---

## Task 3: Seed three example questions under `data/questions/`

**Files:**
- Create: `data/questions/b056-two-sum/meta.json`
- Create: `data/questions/b056-two-sum/statement.md`
- Create: `data/questions/b056-two-sum/cases/sample-01.in`
- Create: `data/questions/b056-two-sum/cases/sample-01.out`
- Create: `data/questions/a013-fibonacci/meta.json`
- Create: `data/questions/a013-fibonacci/statement.md`
- Create: `data/questions/a013-fibonacci/cases/sample-01.in`
- Create: `data/questions/a013-fibonacci/cases/sample-01.out`
- Create: `data/questions/c027-quicksort-stats/meta.json`
- Create: `data/questions/c027-quicksort-stats/statement.md`
- Create: `data/questions/c027-quicksort-stats/cases/sample-01.in`
- Create: `data/questions/c027-quicksort-stats/cases/sample-01.out`

These are placeholder seeds for development. Stats are hand-picked plausible values — real numbers come in Phase 7. UVA references are made-up but plausible.

- [ ] **Step 1: Create `data/questions/b056-two-sum/meta.json`**

```json
{
  "id": "b056-two-sum",
  "title": "兩數之和",
  "gpeYear": 2024,
  "gpeSession": 2,
  "gpeNo": "B056",
  "uvaId": 12345,
  "uvaName": "Sum it Up",
  "tags": ["array", "hashing"],
  "difficulty": "easy",
  "timeLimitMs": 2000,
  "memLimitMb": 256,
  "judge": { "mode": "whitespace" },
  "generatedSeeds": [],
  "stats": {
    "appearanceCount": 6,
    "lastAppearedYear": 2024,
    "acRate": 0.71,
    "recommendationScore": 0
  }
}
```

(Score is 0 placeholder; `build-manifest.ts` will overwrite it in Task 4.)

- [ ] **Step 2: Create `data/questions/b056-two-sum/statement.md`**

```markdown
# 兩數之和

給定一個整數陣列 `nums` 與一個整數 `target`，回傳兩個索引使得 `nums[i] + nums[j] == target`。

## 輸入

第一行兩個整數 `n target`。第二行 `n` 個整數，空白分隔。

## 輸出

兩個索引（0-based），以一個空白分隔。題目保證恰有一組解。

## 限制

`1 ≤ n ≤ 10^5`，`-10^9 ≤ nums[i], target ≤ 10^9`。

## 來源

GPE 2024 場次 2 第 B056 題。等同於 [UVA 12345 — Sum it Up](https://onlinejudge.org/)。
```

- [ ] **Step 3: Create `data/questions/b056-two-sum/cases/sample-01.in`**

```
4 9
2 7 11 15
```

- [ ] **Step 4: Create `data/questions/b056-two-sum/cases/sample-01.out`**

```
0 1
```

- [ ] **Step 5: Create `data/questions/a013-fibonacci/meta.json`**

```json
{
  "id": "a013-fibonacci",
  "title": "費氏數列",
  "gpeYear": 2019,
  "gpeSession": 1,
  "gpeNo": "A013",
  "uvaId": null,
  "uvaName": null,
  "tags": ["recursion", "dp", "math"],
  "difficulty": "easy",
  "timeLimitMs": 1000,
  "memLimitMb": 128,
  "judge": { "mode": "whitespace" },
  "generatedSeeds": [],
  "stats": {
    "appearanceCount": 2,
    "lastAppearedYear": 2019,
    "acRate": 0.92,
    "recommendationScore": 0
  }
}
```

- [ ] **Step 6: Create `data/questions/a013-fibonacci/statement.md`**

```markdown
# 費氏數列

讀入一個正整數 `n`，輸出 `F(n)`，其中 `F(1) = F(2) = 1`，`F(n) = F(n-1) + F(n-2)`。

## 限制

`1 ≤ n ≤ 90`（保證結果落在 64-bit 整數範圍內）。
```

- [ ] **Step 7: Create `data/questions/a013-fibonacci/cases/sample-01.in`**

```
10
```

- [ ] **Step 8: Create `data/questions/a013-fibonacci/cases/sample-01.out`**

```
55
```

- [ ] **Step 9: Create `data/questions/c027-quicksort-stats/meta.json`**

```json
{
  "id": "c027-quicksort-stats",
  "title": "快速排序統計",
  "gpeYear": 2023,
  "gpeSession": 3,
  "gpeNo": "C027",
  "uvaId": 23456,
  "uvaName": "Quicksort Statistics",
  "tags": ["sorting", "recursion", "stats"],
  "difficulty": "hard",
  "timeLimitMs": 3000,
  "memLimitMb": 256,
  "judge": { "mode": "whitespace" },
  "generatedSeeds": [],
  "stats": {
    "appearanceCount": 4,
    "lastAppearedYear": 2023,
    "acRate": 0.34,
    "recommendationScore": 0
  }
}
```

- [ ] **Step 10: Create `data/questions/c027-quicksort-stats/statement.md`**

```markdown
# 快速排序統計

實作 Hoare partition 的快速排序，並回報過程中執行的比較次數與交換次數。

## 輸入

第一行整數 `n`。第二行 `n` 個整數。

## 輸出

第一行：排序後的陣列（空白分隔）。
第二行：比較次數 與 交換次數，以一個空白分隔。

## 限制

`1 ≤ n ≤ 10^4`，`-10^9 ≤ a[i] ≤ 10^9`。Pivot 一律選擇子陣列的第一個元素。
```

- [ ] **Step 11: Create `data/questions/c027-quicksort-stats/cases/sample-01.in`**

```
5
3 1 4 1 5
```

- [ ] **Step 12: Create `data/questions/c027-quicksort-stats/cases/sample-01.out`**

```
1 1 3 4 5
7 4
```

- [ ] **Step 13: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add data/questions/
git commit -m "feat(data): seed 3 example questions (b056, a013, c027) for development"
```

---

## Task 4: Build-time manifest pipeline

**Files:**
- Create: `tools/tsconfig.json`
- Create: `tools/package.json`
- Create: `tools/build-manifest.ts`
- Create: `tools/validate-question.ts`
- Modify: `app/.gitignore` (add `src/data/manifest.gen.ts`)
- Modify: `app/package.json` (add `prebuild` script)

- [ ] **Step 1: Create `tools/package.json`**

```json
{
  "name": "gpe-practice-tools",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build-manifest": "tsx build-manifest.ts",
    "validate-question": "tsx validate-question.ts"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.7.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create `tools/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 3: Install tools deps**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm install
```

- [ ] **Step 4: Create `tools/build-manifest.ts`**

This script walks `data/questions/`, validates each, computes recommendation scores, writes `app/src/data/manifest.gen.ts`.

```ts
#!/usr/bin/env tsx
/**
 * Walk data/questions/<slug>/meta.json, validate against the shared zod schema,
 * compute the build-time portion of the recommendation score, emit a typed
 * manifest module at app/src/data/manifest.gen.ts.
 *
 * Run with:  pnpm --filter gpe-practice-tools build-manifest
 * Or from app/ via `pnpm prebuild` (wired in app/package.json).
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')
const OUT_FILE = join(REPO_ROOT, 'app', 'src', 'data', 'manifest.gen.ts')

// --- Schema (kept in sync with app/src/data/schema.ts; manually mirrored) ---

const JudgeModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact') }),
  z.object({ mode: z.literal('whitespace') }),
  z.object({ mode: z.literal('float'), eps: z.number().positive() }),
])

const QuestionMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  gpeYear: z.number().int().min(2000).max(2100),
  gpeSession: z.number().int().min(1).max(12),
  gpeNo: z.string().min(1),
  uvaId: z.number().int().positive().nullable(),
  uvaName: z.string().min(1).nullable(),
  tags: z.array(z.string().min(1)),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  timeLimitMs: z.number().int().positive(),
  memLimitMb: z.number().int().positive(),
  judge: JudgeModeSchema,
  generatedSeeds: z.array(z.object({ seed: z.number().int().nonnegative(), label: z.string().min(1) })),
  stats: z.object({
    appearanceCount: z.number().int().nonnegative(),
    lastAppearedYear: z.number().int().min(2000).max(2100),
    acRate: z.number().min(0).max(1),
    recommendationScore: z.number().min(0).max(100),
  }),
})

type QuestionMeta = z.infer<typeof QuestionMetaSchema>

// --- Recommendation score (must match app/src/lib/recommendationScore.ts) ---

function computeBuildTimeScore(
  stats: { appearanceCount: number; lastAppearedYear: number; acRate: number },
  maxAppearanceCount: number,
  currentYear: number,
): number {
  const freqNorm = maxAppearanceCount > 0 ? stats.appearanceCount / maxAppearanceCount : 0
  const yearGap = Math.max(0, Math.min(10, currentYear - stats.lastAppearedYear))
  const recencyNorm = 1 - yearGap / 10
  const difficultyNorm = Math.max(0, Math.min(1, 1 - stats.acRate))
  const raw = 90 * (0.4 * freqNorm + 0.3 * recencyNorm + 0.2 * difficultyNorm)
  return Math.round(Math.max(0, Math.min(90, raw)) * 10) / 10
}

// --- Walk and validate ---

function listQuestionDirs(): string[] {
  if (!existsSync(QUESTIONS_DIR)) return []
  return readdirSync(QUESTIONS_DIR)
    .filter((entry) => statSync(join(QUESTIONS_DIR, entry)).isDirectory())
    .sort()
}

function loadMeta(dir: string): QuestionMeta {
  const file = join(QUESTIONS_DIR, dir, 'meta.json')
  if (!existsSync(file)) throw new Error(`Missing meta.json at ${relative(REPO_ROOT, file)}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const parsed = QuestionMetaSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Schema validation failed for ${dir}:\n${issues}`)
  }
  if (parsed.data.id !== dir) {
    throw new Error(`meta.json id "${parsed.data.id}" does not match folder name "${dir}"`)
  }
  return parsed.data
}

// --- Emit manifest.gen.ts ---

function emitManifest(metas: QuestionMeta[], currentYear: number): string {
  const maxAppearance = metas.reduce((m, q) => Math.max(m, q.stats.appearanceCount), 0)
  const enriched = metas.map((m) => ({
    ...m,
    stats: {
      ...m.stats,
      recommendationScore: computeBuildTimeScore(m.stats, maxAppearance, currentYear),
    },
  }))

  const header = `// AUTO-GENERATED by tools/build-manifest.ts. Do not edit by hand.
// Regenerate via: pnpm --filter gpe-practice-tools build-manifest
// Or run \`pnpm prebuild\` from app/.

import type { QuestionMeta } from './schema'

export const questions: readonly QuestionMeta[] = ${JSON.stringify(enriched, null, 2)} as const

export const corpus = {
  totalQuestions: ${enriched.length},
  maxAppearanceCount: ${maxAppearance},
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  currentYearAssumed: ${currentYear},
} as const
`
  return header
}

// --- Main ---

function main() {
  const dirs = listQuestionDirs()
  const metas = dirs.map(loadMeta)
  const currentYear = new Date().getUTCFullYear()
  const out = emitManifest(metas, currentYear)
  mkdirSync(join(REPO_ROOT, 'app', 'src', 'data'), { recursive: true })
  writeFileSync(OUT_FILE, out, 'utf8')
  console.log(`Wrote ${relative(REPO_ROOT, OUT_FILE)} (${metas.length} questions)`)
}

main()
```

- [ ] **Step 5: Create `tools/validate-question.ts`** — focused CLI used by CI in Phase 6

```ts
#!/usr/bin/env tsx
/**
 * CLI: validate one or more question directories against the shared schema.
 * Usage: tsx validate-question.ts [question-id ...]
 * If no ids given, validates ALL questions under data/questions/.
 * Exits 0 if all valid, 1 otherwise.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

const JudgeModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact') }),
  z.object({ mode: z.literal('whitespace') }),
  z.object({ mode: z.literal('float'), eps: z.number().positive() }),
])

const QuestionMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  gpeYear: z.number().int().min(2000).max(2100),
  gpeSession: z.number().int().min(1).max(12),
  gpeNo: z.string().min(1),
  uvaId: z.number().int().positive().nullable(),
  uvaName: z.string().min(1).nullable(),
  tags: z.array(z.string().min(1)),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  timeLimitMs: z.number().int().positive(),
  memLimitMb: z.number().int().positive(),
  judge: JudgeModeSchema,
  generatedSeeds: z.array(z.object({ seed: z.number().int().nonnegative(), label: z.string().min(1) })),
  stats: z.object({
    appearanceCount: z.number().int().nonnegative(),
    lastAppearedYear: z.number().int().min(2000).max(2100),
    acRate: z.number().min(0).max(1),
    recommendationScore: z.number().min(0).max(100),
  }),
})

function listAll(): string[] {
  if (!existsSync(QUESTIONS_DIR)) return []
  return readdirSync(QUESTIONS_DIR)
    .filter((entry) => statSync(join(QUESTIONS_DIR, entry)).isDirectory())
    .sort()
}

function validateOne(id: string): boolean {
  const dir = join(QUESTIONS_DIR, id)
  if (!existsSync(dir)) {
    console.error(`✘ ${id}: directory not found`)
    return false
  }
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) {
    console.error(`✘ ${id}: missing meta.json`)
    return false
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(metaPath, 'utf8'))
  } catch (e) {
    console.error(`✘ ${id}: meta.json is not valid JSON — ${(e as Error).message}`)
    return false
  }
  const result = QuestionMetaSchema.safeParse(raw)
  if (!result.success) {
    console.error(`✘ ${id}: schema validation failed`)
    for (const issue of result.error.issues) {
      console.error(`    - ${issue.path.join('.')}: ${issue.message}`)
    }
    return false
  }
  if (result.data.id !== id) {
    console.error(`✘ ${id}: meta.json id field "${result.data.id}" does not match folder name`)
    return false
  }
  console.log(`✔ ${id}`)
  return true
}

const args = process.argv.slice(2)
const ids = args.length > 0 ? args : listAll()
let ok = true
for (const id of ids) {
  if (!validateOne(id)) ok = false
}
process.exit(ok ? 0 : 1)
```

- [ ] **Step 6: Add `prebuild` script to `app/package.json`**

Find the existing `"scripts"` object and add a `prebuild` entry that runs the manifest builder:

```json
"prebuild": "pnpm --dir ../tools build-manifest",
"predev": "pnpm --dir ../tools build-manifest",
```

Both `prebuild` and `predev` so the manifest is fresh on both `pnpm dev` and `pnpm build`.

Use the Edit tool. The exact `old_string` to find should be the `"scripts"` object's first entry — adjust based on actual file state.

- [ ] **Step 7: Add `src/data/manifest.gen.ts` to `app/.gitignore`**

Append to `app/.gitignore`:

```

# Generated by tools/build-manifest.ts; regenerated by pnpm prebuild / predev
src/data/manifest.gen.ts
```

- [ ] **Step 8: Run the manifest builder, confirm it emits a valid file**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm build-manifest
```

Expected: `Wrote app/src/data/manifest.gen.ts (3 questions)` (or however many seed questions exist).

Then verify the output:

```powershell
Get-Item d:\GitHub\GPE-Practice\app\src\data\manifest.gen.ts | Select-Object Length
```

Expected: non-trivial size (~1-5 KB).

- [ ] **Step 9: Verify the validate-question CLI**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm validate-question
```

Expected: `✔ a013-fibonacci`, `✔ b056-two-sum`, `✔ c027-quicksort-stats`, exit 0.

Then test failure mode by passing a bogus id:

```powershell
pnpm validate-question nonexistent-question
```

Expected: `✘ nonexistent-question: directory not found`, exit 1.

- [ ] **Step 10: Run a full `pnpm build` from `app/` to confirm `prebuild` integration works**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm build
```

Expected: console shows `Wrote app/src/data/manifest.gen.ts (3 questions)` before tsc + vite run. Build succeeds. `dist/` produced. (Note: `manifest.gen.ts` is not imported anywhere yet, but the build should still succeed — TypeScript will compile the unreferenced file.)

If build fails because manifest.gen.ts has type issues, STOP and report. Most likely cause: the emitted JSON doesn't match the inferred `QuestionMeta` type exactly. Inspect `app/src/data/manifest.gen.ts` and fix the emitter.

- [ ] **Step 11: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/ app/.gitignore app/package.json
git commit -m "feat(tools): build-manifest + validate-question; wire prebuild/predev in app"
```

---

## Task 5: Question List UI

**Files:**
- Modify: `app/src/routes/QuestionList.tsx` (full implementation)
- Create: `app/src/components/QuestionListRow.tsx`
- Create: `app/src/components/StatusBadge.tsx`
- Create: `app/src/components/TagChip.tsx`
- Modify: `app/src/i18n/zh-Hant.json` (add list strings)
- Modify: `app/src/store/ide.ts` (add favorites + my-status helpers)

- [ ] **Step 1: Extend `app/src/i18n/zh-Hant.json`** — add the strings the list UI needs

Use the Edit tool to add these keys. The new `questionList` block replaces the placeholder one:

```json
"questionList": {
  "title": "題目列表",
  "search": "搜尋題目（標題或編號）",
  "sortBy": "排序",
  "filter": "篩選",
  "showPassedOnly": "僅顯示已通過",
  "hidePassed": "隱藏已通過",
  "noMatches": "沒有符合條件的題目。",
  "empty": "目前沒有題目；請等待後續 PR 貢獻。",
  "columns": {
    "recommendationScore": "推薦度",
    "title": "題目",
    "appearanceCount": "出題次數",
    "lastAppearedYear": "最近出題",
    "acRate": "AC 率",
    "tags": "標籤",
    "myStatus": "我的狀態"
  },
  "sort": {
    "recommendation": "推薦度",
    "appearances": "出題次數",
    "recency": "最近出題",
    "acRate": "AC 率（由低至高）",
    "title": "標題"
  },
  "status": {
    "untried": "未嘗試",
    "tried": "嘗試中",
    "passed": "已通過"
  },
  "favorite": "收藏",
  "unfavorite": "取消收藏"
}
```

- [ ] **Step 2: Extend `app/src/store/ide.ts`** — add favorites + helpers

Use the Edit tool. After the existing `setRunning`, add:

```ts
favorites: Record<string, true>            // questionId -> true
hasPassed: (questionId: string) => boolean // derived from results
toggleFavorite: (questionId: string) => void
isFavorite: (questionId: string) => boolean
```

The full updated interface and store:

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Verdict = 'PENDING' | 'AC' | 'WA' | 'TLE' | 'RE'

export interface IdeState {
  source: Record<string, string>
  results: Record<string, Record<string, Verdict>>
  favorites: Record<string, true>
  isRunning: boolean
  setSource: (questionId: string, src: string) => void
  setResult: (questionId: string, caseId: string, verdict: Verdict) => void
  setRunning: (running: boolean) => void
  toggleFavorite: (questionId: string) => void
  isFavorite: (questionId: string) => boolean
  hasPassed: (questionId: string) => boolean
}

export const useIdeStore = create<IdeState>()(
  persist(
    (set, get) => ({
      source: {},
      results: {},
      favorites: {},
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
    }),
    {
      name: 'gpe-ide-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        source: state.source,
        results: state.results,
        favorites: state.favorites,
      }),
    },
  ),
)
```

- [ ] **Step 3: Create `app/src/components/StatusBadge.tsx`**

```tsx
import { useTranslation } from 'react-i18next'

type Status = 'untried' | 'tried' | 'passed'

const colors: Record<Status, string> = {
  untried: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  tried: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  passed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {t(`questionList.status.${status}`)}
    </span>
  )
}
```

- [ ] **Step 4: Create `app/src/components/TagChip.tsx`**

```tsx
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
```

- [ ] **Step 5: Create `app/src/components/QuestionListRow.tsx`**

```tsx
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
```

- [ ] **Step 6: Replace `app/src/routes/QuestionList.tsx`** with the real implementation

```tsx
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
```

- [ ] **Step 7: Run a fresh build + test**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm build
pnpm test
```

Expected: build clean. The existing 3 App smoke tests + 5 schema + 7 score = **15 tests pass**. The test for "renders the question list as the default route" should still pass because the heading text `題目列表` is unchanged.

If the App test fails because of `manifest.gen.ts` not existing during test (Vitest doesn't run `predev`/`prebuild`):
- This is a known concern. The fix: run `pnpm --dir ../tools build-manifest` before `pnpm test`. Or update the test setup to mock the manifest. For Phase 2, just make sure `manifest.gen.ts` exists before `pnpm test` is run.

A practical workaround: add a `pretest` script too:

Edit `app/package.json` scripts section — add:
```json
"pretest": "pnpm --dir ../tools build-manifest",
```

Re-run `pnpm test` → should be clean.

- [ ] **Step 8: Smoke-test dev server visually**

```powershell
cd d:\GitHub\GPE-Practice\app
$proc = Start-Process -PassThru -NoNewWindow pnpm -ArgumentList 'dev'
Start-Sleep -Seconds 8
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 10
  if ($r.Content -match 'GPE 練習平台') { Write-Host 'DEV PASS' }
  else { Write-Host 'DEV FAIL'; exit 1 }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue
}
```

- [ ] **Step 9: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/i18n/ app/src/store/ app/src/components/ app/src/routes/QuestionList.tsx app/package.json
git commit -m "feat(app): question list UI with sort/filter/search + favorites + status"
```

---

## Task 6: Unit tests for the manifest builder (optional but recommended)

**Files:**
- Create: `tools/build-manifest.test.ts`
- Create: `tools/__fixtures__/valid-question/meta.json`
- Create: `tools/__fixtures__/valid-question/statement.md`

This is light verification that the build script's main components work; lower priority than the prior tasks.

- [ ] **Step 1: Add Vitest to tools/**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm add -D vitest
```

- [ ] **Step 2: Create `tools/vitest.config.ts`** (minimal)

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({})
```

- [ ] **Step 3: Create `tools/build-manifest.test.ts`**

This test extracts and tests the `computeBuildTimeScore` function inline since it's not currently exported. To keep the test simple, refactor `build-manifest.ts` to export the function:

Edit `tools/build-manifest.ts` — change `function computeBuildTimeScore(...)` to `export function computeBuildTimeScore(...)`. No other changes needed.

Then write the test:

```ts
import { describe, it, expect } from 'vitest'
import { computeBuildTimeScore } from './build-manifest'

describe('computeBuildTimeScore (tools-side mirror)', () => {
  it('matches the app-side formula for a typical question', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 5, lastAppearedYear: 2024, acRate: 0.5 },
      10,
      2026,
    )
    // freq: 5/10 = 0.5; recency: 1 - 2/10 = 0.8; difficulty: 0.5
    // raw = 90 * (0.4*0.5 + 0.3*0.8 + 0.2*0.5) = 90 * 0.54 = 48.6
    expect(score).toBeCloseTo(48.6, 1)
  })

  it('clamps year gap to 10', () => {
    const score = computeBuildTimeScore(
      { appearanceCount: 0, lastAppearedYear: 1990, acRate: 1 },
      10,
      2026,
    )
    expect(score).toBe(0)
  })
})
```

- [ ] **Step 4: Run the tools test**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm exec vitest run
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/
git commit -m "test(tools): unit tests for build-manifest score formula"
```

---

## Task 7: Final verification + tag

- [ ] **Step 1: Clean-build the whole pipeline from a clean state**

```powershell
cd d:\GitHub\GPE-Practice\app
Remove-Item -Recurse -Force node_modules, dist, src/data/manifest.gen.ts -ErrorAction SilentlyContinue

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

All steps must complete without errors.

- [ ] **Step 2: Confirm git is clean**

```powershell
cd d:\GitHub\GPE-Practice
git status
```

Expected: working tree clean.

- [ ] **Step 3: Tag**

```bash
cd d:\GitHub\GPE-Practice
git tag phase-2-question-data-complete
git log --oneline -15
```

---

## Definition of Done for Phase 2

- [ ] `data/questions/` contains at least 3 seed questions, each with `meta.json` (zod-validated), `statement.md`, and at least one sample case pair.
- [ ] `tools/build-manifest.ts` walks `data/questions/`, validates, computes build-time recommendation scores, emits `app/src/data/manifest.gen.ts`.
- [ ] `tools/validate-question.ts` runs as a CI-friendly CLI returning exit code 0 (all valid) or 1 (any invalid).
- [ ] `app/src/data/schema.ts` exports the zod schema + inferred types; covered by unit tests.
- [ ] `app/src/lib/recommendationScore.ts` exports `computeBuildTimeScore` + `addNotPassedBonus`; covered by unit tests.
- [ ] `docs/recommendation-score.md` documents the formula.
- [ ] `app/src/routes/QuestionList.tsx` renders the seed questions with: 推薦度-default sort, search, tag chips, sort dropdown, hide-passed toggle, favorites star, status badge.
- [ ] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build` all clean from a fresh checkout of the post-Phase-2 state.
- [ ] Tag `phase-2-question-data-complete` exists.

After all above, Phase 3 (WASM engine) can begin. Phase 3 will integrate emception via the spike artifacts and wire `engine/compiler.ts`, `runtime.ts`, `judge.ts` into a Web Worker.

---

## What to do if you're stuck

- **`pnpm prebuild` runs but the manifest emit fails with `Cannot find module 'zod'`**: tools/ has its own node_modules; ensure `pnpm install` was run in `tools/` separately.
- **`manifest.gen.ts` reports `as const` errors**: TypeScript can't always widen `as const` over deeply nested literal objects emitted by `JSON.stringify`. Drop the `as const` from the emitted file (still typed via the `: readonly QuestionMeta[]` annotation).
- **Vitest fails because `manifest.gen.ts` doesn't exist**: add `pretest` to `app/package.json` scripts. The plan covers this in Task 5 Step 7.
- **`@/` path alias not resolving**: confirm `tsconfig.json` has the path mapping AND `vite.config.ts` has the alias. Both must agree.
- **Question list shows blank "stats"** column values: `manifest.gen.ts` may not have been regenerated after a schema change. Re-run `pnpm --dir ../tools build-manifest`.
