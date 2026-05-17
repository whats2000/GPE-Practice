# GPE-Practice Rebuild — Design Specification

**Status:** Draft for review
**Date:** 2026-05-18
**Authors:** @whats2000 (with assistant brainstorm)
**Supersedes:** the current GPE-Helper static frontend (kept alive as `third_party/GPE-Helper` submodule and at its original URL)

---

## 1. Purpose

Evolve the existing GPE-Helper (a Taiwan GPE exam history browser) into a full **practice platform**. The current site only shows what GPE has asked historically; it never let students *practice*. The school's own judge server is no longer available, so we need a self-contained way for students to:

1. Pick a GPE question to practice.
2. Open it in an in-browser IDE.
3. Run their C++ code against a known test set.
4. Receive a verdict.
5. Optionally contribute new questions and test cases back via pull request.

The rebuilt site stays a **100% static deployment** on GitHub Pages — no backend we operate runs at request time. All data mutations are gated by pull requests or GitHub Actions.

The website's UI is **Traditional Chinese (zh-Hant)** by default, matching the original GPE-Helper audience.

---

## 2. Design invariants

These constraints drove every other decision in this document. If a future change conflicts with one of these, the change is wrong by default.

1. **Static-only deployment.** The build artifact (`app/dist/`) is the entirety of what runs at user time. No serverless functions, no databases, no per-user backend.
2. **All canonical data updates go through a pull request.** Either opened manually by a contributor (with octokit) or by a GitHub Action.
3. **Reference solution is the single source of truth for "correct".** A test case is valid iff `reference.cpp` produces its expected output. Contributors cannot ship a case that disagrees with the reference.
4. **The user's code never leaves their browser** unless the user explicitly chooses to share it.
5. **No LLM ever runs in the user's browser.** All LLM use lives in GitHub Actions, gated by maintainer-controlled triggers.
6. **Desktop-only for v1.** WASM compiler payload (~30 MB) makes mobile a bad UX.

---

## 3. Architecture overview

A single React + TypeScript SPA built with Vite, statically deployed to GitHub Pages. Three runtime "engines" run entirely in the browser; one CI pipeline runs on GitHub-hosted runners.

```
                ┌────────────────────────── Browser (the only user-time runtime) ───────────────────┐
                │                                                                                    │
                │   React SPA  ─┬─►  Question browser   (reads /data/questions/*.json at build)      │
                │               ├─►  Practice IDE   ── Monaco editor + problem pane (LeetCode-style) │
                │               │           │         ── Exam Mode (Code::Blocks-style chrome)       │
                │               │           ▼                                                        │
                │               │      WASM C++ engine  (clang + libc++ in a Web Worker)             │
                │               │           │                                                        │
                │               │           ▼                                                        │
                │               │      Judge harness  (runs user binary per case, diffs stdout)      │
                │               │                                                                    │
                │               └─►  Contribute panel ── octokit (Device Flow token) ──► GitHub      │
                │                                                                                    │
                └────────────────────────────────────────────────────────────────────────────────────┘

  Build time (CI only, never user-time):
     - Vite builds the SPA; bakes /data/questions/* into static assets
     - validate-pr.yml on every PR: schema-validate + compile reference.cpp natively + run vs all cases
     - register-new-question.yml on new-question PR / maintainer dispatch: LLM emits generator.cpp + validator.cpp,
       CI compiles them, runs generator vs seed list, validates inputs, runs reference to compute outputs,
       commits the result back to the PR branch.
     - deploy-pages.yml on push to main: build & deploy to gh-pages
```

---

## 4. User journeys

### 4.1 Journey A — Practice an existing question

1. User opens `/` → sees the question list sorted by **推薦度** (recommendation score, see §6.1).
2. User clicks a question → route is `/q/<id>`.
3. The question view loads in **Practice mode** by default (LeetCode-style split: problem on left, editor + testcases on right).
4. User writes code in Monaco. Code persists to `localStorage` keyed on `<id>`.
5. User clicks ▶ Run:
   - `engine/compiler.ts` (in a Web Worker) compiles the source with clang.wasm.
   - For each currently-open test case: `engine/runtime.ts` instantiates the binary, pipes stdin, captures stdout/stderr/exit code/wall-clock.
   - `engine/judge.ts` diffs actual vs expected per the question's `judge` mode.
   - `OutputPanel` renders per-case verdicts: AC / WA / RE / TLE.
6. User clicks ✓ Submit:
   - Same flow, but runs against the canonical case set (samples + hidden + generated + community). BYOK stress cases (none in v1 — see §13) excluded.
   - Result is appended to a submissions log in `localStorage`.

User can switch to **Exam Mode** tab at any time. Exam Mode is a "spiritual replica" of the Code::Blocks IDE used in the real GPE exam: full-page editor with toolbar + project tree + bottom build-log pane + F9 = compile-and-run. The problem statement is hidden by default; a small "👁 顯示題目" button peeks. Code, cursor, and test results are shared with Practice mode — switching tabs is purely chrome.

### 4.2 Journey B — Add a test case to an existing question

1. User is in the IDE → Testcases tab.
2. User clicks "+ 新增測資" → form opens (stdin, expected stdout, optional note).
3. User can click "Preview" — runs the user's own current source against the proposed input and shows the actual output. This is *not* a reference run (we don't ship `reference.cpp` to the browser; see §11 trust boundaries).
4. User clicks "送出 PR":
   - If GitHub is not connected → triggers Device Flow.
   - octokit forks the repo if needed, creates a branch (`add-case/<id>/<timestamp>`), commits one `.in`/`.out` pair to `data/questions/<id>/cases/community-<NNN>.in/.out`, opens a PR.
5. CI (`validate-pr.yml`) runs `reference.cpp` against the new case. If its output disagrees with the contributor's expected output, the PR fails with a diff comment. Path to resolution: open an issue ("reference solution wrong") rather than merging a contradictory case.
6. Maintainer reviews and merges. Case is canonical for everyone on next deploy.

### 4.3 Journey C — Suggest a new GPE question

1. User is on the question list → clicks "+ 建議新題目" (top right).
2. Form fields:
   - GPE 年度 / 場次 / 題號
   - 題目標題
   - **UVA 題號 / UVA 題目名稱** (most GPE problems mirror UVA Online Judge; this is the canonical link)
   - 標籤、難度、時間限制、記憶體限制、判題模式
   - Sample input / expected output (at least one pair)
   - Statement note (markdown, optional — defaults to "見 UVA [link]" since we don't re-host UVA's statement)
3. User clicks "送出 PR" → octokit opens a PR with:
   - `data/questions/<slug>/meta.json` (filled from form)
   - `data/questions/<slug>/statement.md`
   - `data/questions/<slug>/cases/sample-01.in` + `.out`
   - `data/questions/<slug>/solutions/reference.cpp` — blank template marked `// TODO: paste reference`
4. CI (`validate-pr.yml`) marks the PR as "draft — needs reference solution" if `reference.cpp` is still the template.
5. The `register-new-question.yml` workflow fires when the PR is labeled `new-question` (the NewQuestionForm sets the label on submission):
   - LLM emits `generators/generator.cpp` + `generators/validator.cpp` + `generators/constraints.md`. These are committed back to the PR branch regardless of `reference.cpp` state, so reviewers can immediately inspect the generator.
   - The "produce `cases/generated-NNN.in/.out`" step is **skipped** if `reference.cpp` is still the empty template (cases cannot exist without ground truth).
6. A maintainer or the contributor commits the real `reference.cpp`. Then either:
   - A push to the PR re-triggers `register-new-question.yml` (it sees a populated reference and runs the case-generation step this time), **or**
   - A maintainer runs `regenerate-cases.yml` via `workflow_dispatch`.
7. `validate-pr.yml` re-runs against the full set. If green, maintainer merges. Question enters the canonical list on next `main` deploy.

---

## 5. Repository layout

```
GPE-Practice/
├── .github/
│   └── workflows/
│       ├── validate-pr.yml              # every PR touching data/questions/**
│       ├── deploy-pages.yml             # push to main → build & deploy
│       ├── register-new-question.yml    # PR label "new-question" OR maintainer dispatch
│       └── regenerate-cases.yml         # maintainer dispatch only; no LLM call
│
├── app/                                 # the React + TypeScript SPA (Vite)
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── public/
│   │   └── wasm/                        # WASM compiler artifacts (committed binary blobs)
│   │       ├── clang.wasm
│   │       ├── lld.wasm
│   │       └── sysroot.tar              # libc++ headers + libs
│   └── src/
│       ├── main.tsx
│       ├── i18n/
│       │   └── zh-Hant.json             # single locale for v1
│       ├── routes/
│       │   ├── QuestionList.tsx         # browse + filter + "+ 建議新題目"
│       │   ├── QuestionView.tsx         # tabbed shell: Practice | Exam Mode
│       │   └── Settings.tsx             # GitHub auth, theme, hotkeys, export/import data
│       ├── ide/
│       │   ├── PracticeLayout.tsx       # split view: problem | editor + tests
│       │   ├── ExamLayout.tsx           # Code::Blocks-style chrome
│       │   ├── MonacoEditor.tsx         # shared editor instance
│       │   ├── TestcasePanel.tsx        # list + "+ 新增測資" inline form
│       │   └── OutputPanel.tsx          # per-case verdicts
│       ├── engine/
│       │   ├── compiler.ts              # wraps clang.wasm in a Web Worker
│       │   ├── runtime.ts               # runs the wasm binary with stdin → captures stdout
│       │   └── judge.ts                 # exact / whitespace / float / checker diff strategies
│       ├── contrib/
│       │   ├── octokitClient.ts         # token mgmt (device-flow or PAT), fork + branch + PR
│       │   ├── NewQuestionForm.tsx      # GPE id, UVA name+id, tags, sample I/O
│       │   └── AddTestcaseForm.tsx      # LeetCode-style inline form
│       ├── data/
│       │   └── manifest.gen.ts          # generated by tools/build-manifest.ts at build time
│       └── lib/                         # storage, theme, hotkeys, recommendation score
│
├── data/
│   └── questions/
│       └── <id>/                        # kebab-case slug, e.g. b056-two-sum
│           ├── meta.json                # see schema in §6
│           ├── statement.md             # short note + link to UVA PDF (we don't re-host)
│           ├── cases/
│           │   ├── sample-01.in / .out          # hand-curated
│           │   ├── hidden-01.in / .out          # maintainer-curated, hidden in IDE
│           │   ├── generated-001.in / .out      # produced from generator.cpp + seed
│           │   └── community-001.in / .out      # produced by manual PRs
│           ├── generators/
│           │   ├── generator.cpp        # LLM-authored, maintainer-reviewed; argv[1] = seed
│           │   ├── validator.cpp        # testlib-style; rejects out-of-spec inputs
│           │   └── constraints.md       # LLM-extracted human-readable summary
│           └── solutions/
│               └── reference.cpp        # ground truth; CI only, never sent to browser
│
├── tools/                               # build-time scripts (Node, run in CI or by maintainer)
│   ├── validate-question.ts             # zod schema check + filename conventions
│   ├── run-reference.ts                 # compile reference.cpp natively & diff against cases
│   ├── build-manifest.ts                # walks /data/questions, emits manifest.gen.ts
│   ├── llm-emit-generator.ts            # LLM call; emits generator.cpp + validator.cpp + constraints.md
│   └── run-generator-and-reference.ts   # for each seed: gen → validate → ref → commit .in/.out
│
├── docs/
│   ├── recommendation-score.md          # explains the 推薦度 formula (public, PR-tunable)
│   └── superpowers/
│       └── specs/
│           └── 2026-05-18-gpe-practice-rebuild-design.md   # this file
│
├── third_party/
│   └── GPE-Helper/                      # the git submodule (read-only data source)
│
├── .gitmodules
├── .gitignore
├── LICENSE
└── README.md
```

Conventions worth calling out:

- **`app/` is the only thing shipped to GitHub Pages.** `tools/`, `data/`, `solutions/reference.cpp`, and `third_party/` never reach the user's browser. `import.meta.glob` patterns in the SPA explicitly exclude `solutions/`.
- **Question id is a stable kebab-case slug**, not a GPE number — GPE numbers can collide across years. `meta.json` carries the canonical GPE year/no and UVA id separately.
- **WASM blobs are committed** to version-lock the toolchain so a CI run today and a user's browser session next year produce the same binary. Git LFS optional; revisit at spike time.
- **`tools/build-manifest.ts` runs as a pre-build step** so the SPA imports a generated `manifest.gen.ts` rather than walking the filesystem in the browser.

---

## 6. Data conventions

### 6.1 `meta.json` schema (zod-validated)

```ts
interface QuestionMeta {
  id: string                     // kebab-case slug, matches folder name
  title: string                  // zh-Hant
  gpeYear: number                // 2018, 2019, ...
  gpeSession: number             // 1, 2, 3 within a year
  gpeNo: string                  // "B056", "C012", ...
  uvaId: number | null           // UVA Online Judge problem id (null if no mirror)
  uvaName: string | null
  tags: string[]                 // ["array", "hashing", "dp", "greedy", ...]
  difficulty: 'easy' | 'medium' | 'hard'
  timeLimitMs: number            // default 2000
  memLimitMb: number             // default 256
  judge:
    | { mode: 'exact' }
    | { mode: 'whitespace' }                                       // default
    | { mode: 'float'; eps: number }
    // 'checker' mode is reserved for post-v1; see §13.
  generatedSeeds: { seed: number; label: string }[]                // empty for hand-curated questions
  // Aggregated stats (populated by tools/build-manifest.ts from pybin data)
  stats: {
    appearanceCount: number      // how many GPE exams this appeared in
    lastAppearedYear: number
    acRate: number               // 0..1
    recommendationScore: number  // 0..100, computed at build time
  }
}
```

Default `judge.mode` is `whitespace` (strip trailing whitespace per line + trailing blank lines, then compare). This matches what most school OJ systems do and handles the most common newline/space mismatches without contributors having to think about it.

### 6.2 Filename conventions inside `cases/`

| Prefix | Source | Visible in IDE? |
|---|---|---|
| `sample-NN` | Hand-curated by maintainer or new-question PR | Yes (visible by default) |
| `generated-NNN` | `generator.cpp` + seed list in `meta.json` | Hidden by default; user can opt in |
| `community-NNN` | Manual PR via Journey B | Hidden by default; user can opt in |
| `hidden-NN` | Maintainer-curated, intentionally hidden | Never shown in IDE; used only for verdict |

Naming prefix encodes provenance so every contributor and every CI run can see where a case came from.

### 6.3 推薦度 (recommendation score)

Computed at build time in `tools/build-manifest.ts` from `pybin` aggregate stats:

```
score = 100 * (
  0.4 * normalize(appearanceCount, [0, max_in_corpus]) +
  0.3 * normalize(currentYear - lastAppearedYear, [0, 10], inverted=true) +
  0.2 * normalize(1 - acRate, [0, 1]) +
  0.1 * notPassedBonus   // 1 if user hasn't passed; applied client-side
)
```

The first three terms are computed at build time and live in `meta.json.stats.recommendationScore`. The fourth (`notPassedBonus`) is applied client-side from `localStorage` so the same build serves everyone. Formula is documented in `docs/recommendation-score.md` and is PR-tunable.

---

## 7. Tech stack

| Layer | Pick | Reason |
|---|---|---|
| Build/dev | Vite 5 + React 18 + TypeScript 5 | Static output, fast dev, first-class TS |
| UI primitives | Tailwind CSS + shadcn/ui (Radix under the hood) | Tabs / dialogs / forms free; full design control |
| Routing | React Router v6 HashRouter | Avoids GitHub Pages' 404-rewrite issue |
| State | Zustand (global: auth token, theme, IDE state) | Tiny, no boilerplate, plays well with localStorage |
| Editor | Monaco (VS Code engine) with `cpp` language pack | Closest to "real IDE" feel; syntax + bracket matching ship with it |
| Markdown | react-markdown + rehype-highlight | For `statement.md` rendering |
| GitHub client | `@octokit/rest` + `@octokit/auth-oauth-device` | Direct browser use; supports Device Flow |
| Schema | zod | Used in CI (Node) and in-browser (defensive) |
| i18n | react-i18next, single `zh-Hant.json` for v1 | Adding English later is mechanical |
| Testing | Vitest (unit) + Playwright (one E2E happy path) | Vitest is Vite-native; Playwright covers the practice→submit loop |
| Lint/format | ESLint + Prettier + typescript-eslint strict | Standard |

---

## 8. Engine details

### 8.1 `engine/compiler.ts`

```ts
type CompileResult =
  | { ok: true; wasm: Uint8Array; warnings: string[] }
  | { ok: false; diagnostics: ClangDiagnostic[] }

interface Compiler {
  init(): Promise<void>                        // loads clang.wasm + sysroot once
  compile(source: string, opts?: CompileOpts): Promise<CompileResult>
  dispose(): void
}
```

- Owns the WASM toolchain lifecycle. Lazy-loaded on first IDE open, not on app boot.
- Caches the parsed sysroot in IndexedDB so subsequent loads skip the ~30 MB download.
- Runs in a **Web Worker** (not the main thread) so a compile loop never freezes the UI.
- Surfaces structured diagnostics so Monaco renders error squiggles.
- Specific WASM toolchain pick is deferred to the §11 spike — candidates: `wasm-clang`, `clangd-wasm`, `cpp-wasm-toolchain`.

### 8.2 `engine/runtime.ts`

```ts
type RunOutcome =
  | { kind: 'ok';    stdout: string; stderr: string; exitCode: number; ms: number }
  | { kind: 'tle';   partialStdout: string; ms: number }
  | { kind: 'crash'; stderr: string; signal: string; ms: number }

interface Runtime {
  run(wasm: Uint8Array, stdin: string, limitMs: number): Promise<RunOutcome>
}
```

- WASI-style stdin/stdout via shared memory + a JS shim. No filesystem, no network.
- Wall-clock timeout enforced from JS (terminate the worker if exceeded).
- Each run gets a fresh worker — no state leaks between cases.

### 8.3 `engine/judge.ts`

```ts
type JudgeMode =
  | { mode: 'exact' }
  | { mode: 'whitespace' }
  | { mode: 'float'; eps: number }

function judge(expected: string, actual: string, mode: JudgeMode): Verdict
```

Pure functions; trivially unit-testable. A future `checker` mode would load a separately built WASM checker and pipe the three streams in — explicitly deferred (see §13) because compiling per-question `checker.cpp` to WASM requires either the WASM toolchain on CI runners or a build step we haven't budgeted for v1.

### 8.4 Shared IDE state

```ts
const useIdeStore = create<IdeState>((set) => ({
  questionId: '',
  source: '',           // persisted in localStorage per question
  openCases: [],        // ids of cases shown in panel
  results: {},          // verdict per case
  isRunning: false,
  setSource: (s) => set({ source: s }),
  // ...
}))
```

Both `PracticeLayout` and `ExamLayout` subscribe to the same store — switching tabs is a chrome change, never a state reset.

---

## 9. GitHub authentication

GitHub auth is required for Journeys B and C (creating PRs). Browse-only users never authenticate.

- **Primary path:** Device Flow via a registered public GitHub App. User clicks "連結 GitHub" → sees an 8-character code → enters it on `github.com/login/device` → browser polls for token → token stored in `localStorage` (with explicit "登出" that clears it).
- **Fallback path:** Paste a fine-grained PAT. Used if Device Flow CORS turns out to be blocked (see §11 risk 2) or by power users/maintainers who prefer it.

`contrib/octokitClient.ts` exposes a single facade so the rest of the app doesn't care which path was used:

```ts
interface AuthedClient {
  proposeNewTestcase(args: NewTestcaseProposal): Promise<{ prUrl: string }>
  proposeNewQuestion(args: NewQuestionProposal):  Promise<{ prUrl: string }>
  reportBadCase(args: BadCaseReport):              Promise<{ issueUrl: string }>
}
```

Each method handles: fork-if-needed → create branch → commit one or more files → open PR. Returns the URL so the UI can deep-link the user to it.

---

## 10. GitHub Actions workflows

### 10.1 `validate-pr.yml`

Runs on every PR touching `data/questions/**`. Detects changed question ids; for each: zod-validate `meta.json`, lint file naming, compile `solutions/reference.cpp` with native g++, run it against every `cases/*` pair, fail with a diff comment on any mismatch. If `reference.cpp` is still the empty template (new-question PR), mark as "draft — needs reference" with a comment and do not fail.

### 10.2 `register-new-question.yml`

Triggers:
- PR labeled `new-question` (auto-set by the NewQuestionForm component).
- `workflow_dispatch` by a maintainer with `question-id` input.

Per question:

1. `tools/llm-emit-generator.ts` calls the configured LLM (env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) with the statement + meta, asking for a single JSON response containing:
   - `generator_cpp`: a complete C++ program that takes a seed via argv[1] and prints a random valid input to stdout.
   - `validator_cpp`: a testlib-style C++ program that reads an input from stdin and exits 0 if it satisfies the constraints, nonzero otherwise.
   - `constraints_md`: a human-readable summary of the constraints (for reviewer sanity-check).
2. CI compiles `generator.cpp` and `validator.cpp` natively (g++ -O2 -std=c++17).
3. CI compiles `reference.cpp` (skip with warning if still the empty template).
4. For each seed in `meta.json.generatedSeeds`:
   - Run `./gen <seed>` → input bytes.
   - Run `./validator < input` → must exit 0; otherwise drop this case silently.
   - Run `./ref < input` → expected output bytes.
   - Write `data/questions/<id>/cases/generated-NNN.in` and `.out`.
5. `stefanzweifel/git-auto-commit-action` commits `generators/*` and `cases/generated-*` back to the PR branch.

LLM is called **once per new question**. After that, the committed `generator.cpp` + `validator.cpp` make case production fully reproducible without any LLM call.

### 10.3 `regenerate-cases.yml`

Maintainer `workflow_dispatch` only. Re-runs the existing committed `generator.cpp` + `validator.cpp` against current `meta.json.generatedSeeds`, recomputes outputs via `reference.cpp`. **No LLM call.** Used when `reference.cpp` is fixed, seed list is expanded, or the generator is manually edited.

### 10.4 `deploy-pages.yml`

On push to `main`: pnpm install → `tools/build-manifest.ts` → `pnpm --filter app build` → `actions/upload-pages-artifact` → `actions/deploy-pages`. No preview deploys for v1.

### 10.5 LLM client configuration

The LLM client is **provider-agnostic via configurable base URL**:

```yaml
env:
  LLM_BASE_URL: ${{ vars.LLM_BASE_URL || 'https://api.anthropic.com/v1' }}
  LLM_API_KEY:  ${{ secrets.LLM_API_KEY }}
  LLM_MODEL:    ${{ vars.LLM_MODEL || 'claude-sonnet-4-6' }}
```

The script uses the `openai` npm package (since most providers, including Anthropic, expose an OpenAI-compatible chat-completions endpoint) with JSON-mode for deterministic parsing. Maintainers can point at:
- Anthropic native, OpenAI, OpenRouter, Groq, Together, Cerebras, Fireworks, local Ollama (`http://localhost:11434/v1`), or any school/team-hosted gateway

`LLM_API_KEY` is the **only third-party secret** in the project. If absent, `register-new-question.yml` simply doesn't run; new-question PRs stay open with only the sample case until a maintainer provides one.

---

## 11. Risks & spikes (Phase 0 before plan-writing)

### 11.1 WASM C++ toolchain (HIGH)

**Claim:** clang + libc++ in WASM compiles a 30-line `<bits/stdc++.h>`-using sample in ≤ 4 s on a 2020-era laptop.

**Real concerns:** payload size (20–60 MB), `<bits/stdc++.h>` availability, C++17 stdlib completeness, IndexedDB quota on iOS Safari, virtualized stdin/stdout edge cases (`freopen`).

**Spike:** ~1 day. Build a minimal HTML page that loads one specific toolchain (candidates: `wasm-clang`, `clangd-wasm`, `cpp-wasm-toolchain`), compiles a representative GPE-style sample, runs it against a stdin/stdout fixture. Pick the toolchain that supports `<bits/stdc++.h>`, cold compile < 6 s, warm < 1 s, cached payload < 40 MB, permissive license.

**Fallback if no candidate passes:** Re-open Question 1 (the "in-browser vs Judge0 service" decision); the static-only invariant gets a controlled exception for a tiny self-hosted Judge0 instance.

### 11.2 GitHub Device Flow CORS (MEDIUM)

**Claim:** A static site can complete Device Flow purely from a browser.

**Real concern:** GitHub's `POST /login/oauth/access_token` historically returns no CORS headers. GitHub Apps' device-flow endpoint may behave differently; docs are inconsistent.

**Spike:** ~2 hours. Register a test GitHub App, attempt the full flow from a browser, observe the access_token POST.

**Fallback if blocked:** Make PAT the only path. The "連結 GitHub" button becomes "貼上 PAT" with linked instructions. We do *not* introduce a CORS-proxying Worker (would violate static-only invariant).

### 11.3 LLM-authored generators produce out-of-spec inputs (LOW-MEDIUM)

**Claim:** The reference solution is ground truth, so generator bugs don't poison cases.

**Real subtlety:** A buggy generator can emit inputs *outside* stated constraints. The reference's behavior on out-of-spec input is undefined (overflow, infinite loop) — those cases could feel unfair to practicing students.

**Mitigation (already in the spec):** LLM emits `validator.cpp` alongside `generator.cpp`. CI runs the validator on every generated input before the reference; rejected inputs are dropped silently.

### 11.4 Exam Mode authenticity (LOW)

Treat Exam Mode as a **spiritual replica** of Code::Blocks, not a pixel-perfect one. Left-side collapsible project tree, top toolbar with iconic Build/Run buttons, bottom build-log pane mimicking Code::Blocks' build output style, F9 bound to compile-and-run, status bar with line/col + active config. Don't chase exact pixels.

---

## 12. Decisions worth re-reading later

1. **Question list defaults to sorting by 推薦度**, not by date or AC rate. Formula in `docs/recommendation-score.md`.
2. **Local-first for v1.** No cloud sync. localStorage holds code drafts, submission history, favorites, settings. Settings tab includes Export/Import-JSON for cross-machine migration.
3. **Desktop-only.** Viewports `< 1024px` see a polite gate explaining the WASM payload constraint. Question list still works mobile-read-only; IDE routes redirect to an explainer page.
4. **Keep GPE-Helper alive.** No deprecation. Header link from this site to GPE-Helper (and back, if its maintainer wishes). Submodule remains as a data source for the recommendation-score inputs.
5. **`reference.cpp` never enters the browser bundle.** `import.meta.glob` excludes `solutions/`. "Preview" in Journey B's add-testcase form runs the **user's own current source**, not the reference, to avoid leaking ground-truth.

---

## 13. Explicitly out of scope for v1

- Cloud sync of code / submissions
- Mobile IDE support
- BYOK browser LLM features (any LLM use lives in CI)
- Multi-file C++ projects (single-file `main.cpp` only)
- Languages other than C++
- Preview deploys per PR
- Mutation-testing CI (Question 6 Option C) — could be added later
- English UI (i18n scaffolding is in place; English locale deferred)
- `checker` judge mode (would require compiling per-question `checker.cpp` to WASM on CI; only `exact`, `whitespace`, and `float` are supported in v1)

---

## 14. What "done" looks like for v1

- The site is deployed at the new GitHub Pages URL.
- At least 10 questions migrated from the GPE-Helper dataset, each with: meta.json, statement.md, ≥ 3 sample cases, reference.cpp, generator.cpp + validator.cpp, ≥ 5 generated cases.
- A student can: pick a question, write C++ in the editor, run, see per-case verdicts, switch to Exam Mode, submit, see history in localStorage.
- A contributor can: connect GitHub via Device Flow, add a single test case to an existing question via Journey B, see the PR appear on GitHub with `validate-pr.yml` running.
- A maintainer can: open a new-question PR, watch `register-new-question.yml` add `generator.cpp` + `validator.cpp` + generated cases, merge.
- Zero LLM keys in browser code or shipped JS. Zero backend services we operate.
