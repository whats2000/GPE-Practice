# Phase 6 — CI Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the three GitHub Actions workflows defined in the spec (§10): `validate-pr.yml` (gates every data PR), `register-new-question.yml` (LLM emits generator+validator on `new-question` PRs), `regenerate-cases.yml` (maintainer dispatch only, no LLM). All scripts they call live in `tools/` and are runnable locally so the maintainer can iterate without pushing.

**Architecture:**
- `tools/llm-emit-generator.ts` — production version of the smoke-tested `smoke-llm.ts`. Same prompt + same response shape. Writes `data/questions/<id>/generators/{generator.cpp, validator.cpp, constraints.md}`.
- `tools/run-generator-and-reference.ts` — for each seed in `meta.json.generatedSeeds`, runs `gen → val → ref` and writes `cases/generated-NNN.in/.out`. Skips silently on validator rejection. Skips entirely if reference.cpp is the empty template.
- `tools/run-reference.ts` — compiles `reference.cpp` natively and runs it against every `cases/*.in`, diffing per the question's judge mode. Used by validate-pr.
- `tools/detect-changed-questions.mjs` — given a PR diff, lists which question ids were touched (so validate-pr only re-runs the affected ones).
- All three workflows pin Ubuntu, Node 20, pnpm via corepack. Two of them (register + regenerate) need native g++ which `ubuntu-latest` already has.

**Tech Stack:** Bash + native g++ (Linux runners ship gcc-13), pnpm, tsx, the existing schema/zod, `openai` npm package or raw fetch (smoke test used raw fetch — keep that pattern for one less dep).

**Out of scope for Phase 6:** Seeding more questions (Phase 7), preview deploys per PR, mutation-testing CI.

**Local test strategy:** Every script must be runnable from a developer's machine via `pnpm <script>` so they can iterate without pushing. We'll also add a real `solutions/reference.cpp` for `b056-two-sum` so the full pipeline can be exercised locally before committing the workflows.

---

## Files Created/Modified

- Create: `tools/llm-emit-generator.ts`
- Create: `tools/run-generator-and-reference.ts`
- Create: `tools/run-reference.ts`
- Create: `tools/detect-changed-questions.mjs`
- Create: `data/questions/b056-two-sum/solutions/reference.cpp`
- Modify: `data/questions/b056-two-sum/meta.json` (add `generatedSeeds`)
- Modify: `tools/package.json` (add script entries; add `dotenv` dep so scripts work in CI without `--env-file`)
- Modify: `tools/build-manifest.ts` (guard `main()` behind ESM-aware "if run directly" check — minor cleanup we deferred from Phase 2)
- Create: `.github/workflows/validate-pr.yml`
- Create: `.github/workflows/register-new-question.yml`
- Create: `.github/workflows/regenerate-cases.yml`

---

## Task 1: Production LLM script — `tools/llm-emit-generator.ts`

**Files:**
- Create: `tools/llm-emit-generator.ts`
- Modify: `tools/package.json` (script entry + `dotenv` devDep)

The script that the new-question workflow runs. Generalizes `smoke-llm.ts`:
- Reads .env at repo root (using `dotenv`, so the same script works in CI where env vars come from `process.env`)
- Takes `--question-id <id>` flag
- Calls the LLM with the same prompt as the smoke test
- Writes `data/questions/<id>/generators/{generator.cpp, validator.cpp, constraints.md}` (idempotent — overwrites if present)
- Exits 0 on success, 1 on any failure

- [ ] **Step 1: Add `dotenv` to tools devDeps**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm add -D dotenv
```

- [ ] **Step 2: Create `tools/llm-emit-generator.ts`**

```ts
#!/usr/bin/env tsx
/**
 * Production LLM script — generalizes the Phase 5 smoke-llm.ts.
 *
 * Reads .env at repo root (or process.env in CI), calls the configured chat-
 * completions endpoint with a structured-output prompt asking for
 * { constraints_md, generator_cpp, validator_cpp }, writes them to
 * data/questions/<id>/generators/.
 *
 * Run locally:
 *   cd tools && pnpm exec tsx llm-emit-generator.ts --question-id b056-two-sum
 *
 * Run in CI: register-new-question.yml passes LLM_BASE_URL / LLM_API_KEY /
 * LLM_MODEL as env vars via repo secrets+vars.
 *
 * Exits 0 on success, 1 on any failure.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { config as dotenvConfig } from 'dotenv'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

// Load .env at repo root if present. In CI, env vars come from the workflow.
dotenvConfig({ path: join(REPO_ROOT, '.env') })

const { values } = parseArgs({
  options: {
    'question-id': { type: 'string' },
  },
  strict: true,
})

const qid = values['question-id']
if (!qid) {
  console.error('Usage: llm-emit-generator.ts --question-id <id>')
  process.exit(1)
}

const qDir = join(QUESTIONS_DIR, qid)
if (!existsSync(qDir)) {
  console.error(`Question dir not found: ${qDir}`)
  process.exit(1)
}

const LLM_BASE_URL = process.env.LLM_BASE_URL
const LLM_API_KEY = process.env.LLM_API_KEY
const LLM_MODEL = process.env.LLM_MODEL

if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
  console.error('Missing LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in env (or .env)')
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const statement = readFileSync(join(qDir, 'statement.md'), 'utf8')

// --- Prompt (verbatim from smoke-llm.ts; proven to work) ---

const systemPrompt = `You are a competitive-programming problem analyst.

Given a problem statement and metadata, produce three artifacts as JSON:

1. constraints_md: a short markdown summary of the input constraints (variable ranges, edge cases). 5-15 lines.

2. generator_cpp: a complete C++17 program that takes a single command-line integer "seed" and prints a random valid input conforming to the constraints to stdout. Use <random> with mt19937 seeded by the argv seed for determinism. Cover edge cases (smallest, largest, boundary) by scaling input size with seed % small_int. Output ONLY the program input — no commentary.

3. validator_cpp: a complete C++17 program that reads an input from stdin, asserts it matches the stated constraints, exits 0 if valid, non-zero otherwise. Use cstdlib's exit(1) for invalid. Print to stderr the reason for rejection.

Both programs must compile cleanly with: g++ -O2 -std=c++17 file.cpp -o out.exe

Respond with a JSON object: { "constraints_md": string, "generator_cpp": string, "validator_cpp": string }. No additional fields. No commentary outside the JSON.`

const userPrompt = `# ${meta.title}
GPE ${meta.gpeYear} 場次 ${meta.gpeSession}, 題號 ${meta.gpeNo}
Time limit: ${meta.timeLimitMs} ms
Memory limit: ${meta.memLimitMb} MB

## Problem statement

${statement}`

const url = LLM_BASE_URL.replace(/\/$/, '') + '/chat/completions'
const body = {
  model: LLM_MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  response_format: { type: 'json_object' },
  temperature: 0.2,
}

console.log(`POST ${url}  (model=${LLM_MODEL})`)
const t0 = Date.now()
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${LLM_API_KEY}`,
  },
  body: JSON.stringify(body),
})
console.log(`HTTP ${res.status} in ${Date.now() - t0} ms`)

if (!res.ok) {
  console.error(await res.text())
  process.exit(1)
}

const json = (await res.json()) as {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}
const content = json?.choices?.[0]?.message?.content
if (!content) {
  console.error('No content in response. Raw:', JSON.stringify(json, null, 2))
  process.exit(1)
}

let parsed: { constraints_md: string; generator_cpp: string; validator_cpp: string }
try {
  parsed = JSON.parse(content)
} catch (e) {
  console.error('Failed to parse content as JSON:', (e as Error).message)
  console.error('Content:\n', content)
  process.exit(1)
}

for (const k of ['constraints_md', 'generator_cpp', 'validator_cpp'] as const) {
  if (typeof parsed[k] !== 'string' || !parsed[k]) {
    console.error(`Missing or empty field: ${k}`)
    process.exit(1)
  }
}

const outDir = join(qDir, 'generators')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'generator.cpp'), parsed.generator_cpp + '\n', 'utf8')
writeFileSync(join(outDir, 'validator.cpp'), parsed.validator_cpp + '\n', 'utf8')
writeFileSync(join(outDir, 'constraints.md'), parsed.constraints_md + '\n', 'utf8')

console.log(`Wrote ${outDir}/`)
if (json.usage) {
  console.log(`Tokens: prompt=${json.usage.prompt_tokens}, completion=${json.usage.completion_tokens}, total=${json.usage.total_tokens}`)
}
```

- [ ] **Step 3: Add script entry to `tools/package.json`**

Use Edit. In the `"scripts"` block, add:

```json
"llm-emit-generator": "tsx llm-emit-generator.ts"
```

- [ ] **Step 4: Test locally — overwrite the smoke output with the production path**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm llm-emit-generator --question-id b056-two-sum
```

Expected: writes `data/questions/b056-two-sum/generators/{generator.cpp, validator.cpp, constraints.md}` and prints token usage.

Verify:

```powershell
Get-ChildItem d:\GitHub\GPE-Practice\data\questions\b056-two-sum\generators
```

Should list three files.

- [ ] **Step 5: Commit (Task 1 — script only, generators/ files come later)**

```bash
cd d:\GitHub\GPE-Practice
git add tools/package.json tools/pnpm-lock.yaml tools/llm-emit-generator.ts
git commit -m "feat(tools): llm-emit-generator.ts (production LLM script)"
```

---

## Task 2: Generator+reference runner — `tools/run-generator-and-reference.ts`

**Files:**
- Create: `tools/run-generator-and-reference.ts`
- Modify: `tools/package.json` (script entry)

For each seed in `meta.json.generatedSeeds`:
1. Compile `generators/generator.cpp` natively (once, cached across seeds)
2. Compile `generators/validator.cpp` natively (once, cached)
3. Compile `solutions/reference.cpp` natively (once); SKIP CASE GENERATION if reference is the empty template (file exists with only `// TODO` content or `<= 200 bytes`)
4. For each seed: `gen <seed>` → write `.in` → `val < .in` → if validator passes, `ref < .in` → write `.out`. If validator rejects, log and skip.
5. Output files land at `data/questions/<id>/cases/generated-<seed>.in/.out` (filename is `generated-` + the seed integer, NOT a sequential NNN, so the file is reproducibly named for the seed).

- [ ] **Step 1: Create `tools/run-generator-and-reference.ts`**

```ts
#!/usr/bin/env tsx
/**
 * For each seed in meta.json.generatedSeeds:
 *   compile generator.cpp + validator.cpp + reference.cpp natively,
 *   run gen → val → (if valid) ref,
 *   write cases/generated-<seed>.in / .out.
 *
 * Run locally:
 *   cd tools && pnpm exec tsx run-generator-and-reference.ts --question-id b056-two-sum
 *
 * Run in CI: register-new-question.yml + regenerate-cases.yml both call this.
 *
 * Exits 0 on success (even if some seeds were rejected by validator);
 * exits 1 only on compile failures or filesystem errors.
 * If reference.cpp is the empty template, exits 0 and prints a warning;
 * generators are still produced so reviewers can inspect them.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

const { values } = parseArgs({
  options: { 'question-id': { type: 'string' } },
  strict: true,
})

const qid = values['question-id']
if (!qid) {
  console.error('Usage: run-generator-and-reference.ts --question-id <id>')
  process.exit(1)
}

const qDir = join(QUESTIONS_DIR, qid)
if (!existsSync(qDir)) {
  console.error(`Question dir not found: ${qDir}`)
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const seeds: { seed: number; label: string }[] = meta.generatedSeeds ?? []
if (seeds.length === 0) {
  console.log(`No generatedSeeds for ${qid} — nothing to do.`)
  process.exit(0)
}

const genSrc = join(qDir, 'generators', 'generator.cpp')
const valSrc = join(qDir, 'generators', 'validator.cpp')
const refSrc = join(qDir, 'solutions', 'reference.cpp')
for (const f of [genSrc, valSrc, refSrc]) {
  if (!existsSync(f)) {
    console.error(`Missing: ${f}`)
    process.exit(1)
  }
}

// Detect empty reference template — heuristic: file < 200 bytes AND contains "// TODO"
const refText = readFileSync(refSrc, 'utf8')
const refIsTemplate = refText.length < 200 && refText.includes('// TODO')

function gxx(src: string, out: string): void {
  const r = spawnSync('g++', ['-O2', '-std=c++17', src, '-o', out], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`g++ failed for ${src}:\n${r.stderr}`)
    process.exit(1)
  }
}

const tmp = tmpdir()
const genBin = join(tmp, `gen_${qid}.exe`)
const valBin = join(tmp, `val_${qid}.exe`)
const refBin = join(tmp, `ref_${qid}.exe`)

console.log('Compiling generator.cpp...')
gxx(genSrc, genBin)
console.log('Compiling validator.cpp...')
gxx(valSrc, valBin)

if (refIsTemplate) {
  console.warn('reference.cpp is the empty template — skipping case generation.')
  console.warn('Generator + validator are committed; reviewer should populate reference.cpp,')
  console.warn('then rerun this script (or regenerate-cases.yml) to produce cases.')
  process.exit(0)
}

console.log('Compiling reference.cpp...')
gxx(refSrc, refBin)

const casesDir = join(qDir, 'cases')
mkdirSync(casesDir, { recursive: true })

let kept = 0
let rejected = 0
for (const { seed, label } of seeds) {
  const inPath = join(casesDir, `generated-${String(seed).padStart(3, '0')}.in`)
  const outPath = join(casesDir, `generated-${String(seed).padStart(3, '0')}.out`)
  const gen = spawnSync(genBin, [String(seed)], { encoding: 'utf8' })
  if (gen.status !== 0) {
    console.warn(`  seed ${seed} (${label}): generator failed — skipped`)
    rejected++
    continue
  }
  // Validate
  const val = spawnSync(valBin, [], { input: gen.stdout, encoding: 'utf8' })
  if (val.status !== 0) {
    console.warn(`  seed ${seed} (${label}): validator rejected — skipped: ${val.stderr.trim()}`)
    rejected++
    continue
  }
  // Reference
  const ref = spawnSync(refBin, [], { input: gen.stdout, encoding: 'utf8' })
  if (ref.status !== 0) {
    console.warn(`  seed ${seed} (${label}): reference crashed — skipped: ${ref.stderr.trim()}`)
    rejected++
    continue
  }
  writeFileSync(inPath, gen.stdout, 'utf8')
  writeFileSync(outPath, ref.stdout, 'utf8')
  console.log(`  seed ${seed} (${label}): kept (in=${gen.stdout.length}b, out=${ref.stdout.length}b)`)
  kept++
}

console.log(`\nDone. kept=${kept}, rejected=${rejected}`)
```

- [ ] **Step 2: Add script entry**

In `tools/package.json` scripts block:

```json
"run-generator-and-reference": "tsx run-generator-and-reference.ts"
```

- [ ] **Step 3: Test locally (will skip until reference.cpp exists; see Task 4)**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm run-generator-and-reference --question-id b056-two-sum
```

Expected at this stage: error "reference.cpp not found" (because `solutions/reference.cpp` doesn't exist yet). That's fine — Task 4 fixes it. Just confirm the error is clean (not a crash).

- [ ] **Step 4: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/run-generator-and-reference.ts tools/package.json
git commit -m "feat(tools): run-generator-and-reference.ts (gen → val → ref pipeline)"
```

---

## Task 3: Reference runner — `tools/run-reference.ts`

**Files:**
- Create: `tools/run-reference.ts`
- Modify: `tools/package.json`

Compiles `reference.cpp` natively and runs it against every `cases/*.in`, diffs against `cases/*.out` per the question's judge mode. Used by `validate-pr.yml`. Exits 0 if all cases agree, 1 on any disagreement.

Imports the judge logic from the app side — actually no, the app uses TS. We'll inline the small whitespace-normalize / exact / float comparators here to avoid a cross-package import. Three small pure functions.

- [ ] **Step 1: Create `tools/run-reference.ts`**

```ts
#!/usr/bin/env tsx
/**
 * Compile data/questions/<id>/solutions/reference.cpp natively, run it against
 * every cases/*.in, diff against cases/*.out per the question's judge mode.
 *
 * Used by validate-pr.yml.
 *
 * Run locally:
 *   cd tools && pnpm exec tsx run-reference.ts --question-id b056-two-sum
 *
 * Exits 0 if all cases agree with reference; 1 on any disagreement.
 * If reference.cpp is the empty template, exits 0 with a warning (the PR is
 * marked as draft elsewhere).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

type JudgeMode =
  | { mode: 'exact' }
  | { mode: 'whitespace' }
  | { mode: 'float'; eps: number }

function normalizeWhitespace(s: string): string {
  const lines = s.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

function compareFloatTokens(expected: string, actual: string, eps: number): boolean {
  const exp = expected.trim().split(/\s+/).filter(Boolean)
  const act = actual.trim().split(/\s+/).filter(Boolean)
  if (exp.length !== act.length) return false
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i], a = act[i]
    const en = Number(e), an = Number(a)
    if (!Number.isNaN(en) && !Number.isNaN(an)) {
      if (Math.abs(en - an) > eps) return false
    } else if (e !== a) {
      return false
    }
  }
  return true
}

function judge(expected: string, actual: string, mode: JudgeMode): boolean {
  switch (mode.mode) {
    case 'exact': return expected === actual
    case 'whitespace': return normalizeWhitespace(expected) === normalizeWhitespace(actual)
    case 'float': return compareFloatTokens(expected, actual, mode.eps)
  }
}

const { values } = parseArgs({
  options: { 'question-id': { type: 'string' } },
  strict: true,
})

const qid = values['question-id']
if (!qid) {
  console.error('Usage: run-reference.ts --question-id <id>')
  process.exit(1)
}

const qDir = join(QUESTIONS_DIR, qid)
const refSrc = join(qDir, 'solutions', 'reference.cpp')
if (!existsSync(refSrc)) {
  console.error(`Missing: ${refSrc}`)
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const mode: JudgeMode = meta.judge

const refText = readFileSync(refSrc, 'utf8')
if (refText.length < 200 && refText.includes('// TODO')) {
  console.warn(`reference.cpp for ${qid} is the empty template — skipping (PR remains draft).`)
  process.exit(0)
}

const refBin = join(tmpdir(), `ref_${qid}.exe`)
const c = spawnSync('g++', ['-O2', '-std=c++17', refSrc, '-o', refBin], { encoding: 'utf8' })
if (c.status !== 0) {
  console.error(`Compile failed:\n${c.stderr}`)
  process.exit(1)
}

const casesDir = join(qDir, 'cases')
if (!existsSync(casesDir)) {
  console.error(`No cases dir at ${casesDir}`)
  process.exit(1)
}

const inFiles = readdirSync(casesDir).filter((f) => f.endsWith('.in')).sort()
if (inFiles.length === 0) {
  console.warn(`No .in cases for ${qid} — nothing to verify.`)
  process.exit(0)
}

let ok = 0
let bad = 0
for (const fname of inFiles) {
  const stem = fname.slice(0, -'.in'.length)
  const inPath = join(casesDir, fname)
  const outPath = join(casesDir, `${stem}.out`)
  if (!existsSync(outPath)) {
    console.error(`  ${stem}: missing .out`)
    bad++
    continue
  }
  const expected = readFileSync(outPath, 'utf8')
  const stdin = readFileSync(inPath, 'utf8')
  const r = spawnSync(refBin, [], { input: stdin, encoding: 'utf8', timeout: meta.timeLimitMs * 3 })
  if (r.status !== 0 && r.signal !== null) {
    console.error(`  ${stem}: reference signal ${r.signal}`)
    bad++
    continue
  }
  if (r.status !== 0) {
    console.error(`  ${stem}: reference exit code ${r.status}`)
    bad++
    continue
  }
  if (!judge(expected, r.stdout, mode)) {
    console.error(`  ${stem}: MISMATCH`)
    console.error(`    expected:\n${expected}`)
    console.error(`    actual:\n${r.stdout}`)
    bad++
    continue
  }
  ok++
  console.log(`  ${stem}: OK`)
}

console.log(`\n${qid}: ok=${ok}, bad=${bad}`)
process.exit(bad === 0 ? 0 : 1)
```

- [ ] **Step 2: Add script entry**

In `tools/package.json` scripts block:

```json
"run-reference": "tsx run-reference.ts"
```

- [ ] **Step 3: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/run-reference.ts tools/package.json
git commit -m "feat(tools): run-reference.ts (compile + run + diff per judge mode)"
```

---

## Task 4: Real reference solution + generatedSeeds for `b056-two-sum`

**Files:**
- Create: `data/questions/b056-two-sum/solutions/reference.cpp`
- Modify: `data/questions/b056-two-sum/meta.json` (add seeds)

So we can test the full pipeline locally. The two-sum reference is trivial; the validator already asserts "exactly one solution" so we just output the unique pair.

- [ ] **Step 1: Create `data/questions/b056-two-sum/solutions/reference.cpp`**

```cpp
#include <bits/stdc++.h>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long target;
    cin >> n >> target;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];
    unordered_map<long long, int> seen;
    for (int i = 0; i < n; ++i) {
        auto it = seen.find(target - a[i]);
        if (it != seen.end()) {
            cout << it->second << " " << i << "\n";
            return 0;
        }
        seen[a[i]] = i;
    }
    // Unreachable given the "exactly one solution" guarantee
    return 1;
}
```

- [ ] **Step 2: Update `data/questions/b056-two-sum/meta.json`** — add `generatedSeeds`

Use Edit. Find the `"generatedSeeds": [],` line and replace with:

```json
"generatedSeeds": [
  { "seed": 1, "label": "tiny" },
  { "seed": 2, "label": "tiny" },
  { "seed": 7, "label": "small" },
  { "seed": 42, "label": "medium" },
  { "seed": 100, "label": "edge" }
],
```

These five seeds happened to all pass validation in the smoke test. After Task 5 we'll have real generated cases on disk.

- [ ] **Step 3: Verify the new reference compiles + agrees with the existing sample case**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm run-reference --question-id b056-two-sum
```

Expected: `sample-01: OK` and `b056-two-sum: ok=1, bad=0`.

If it fails (e.g., output formatting differs from the sample), check `data/questions/b056-two-sum/cases/sample-01.out` — should be `0 1`. Reference must produce the same.

- [ ] **Step 4: Run the full gen→val→ref pipeline to generate real cases**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm run-generator-and-reference --question-id b056-two-sum
```

Expected: 5 seeds processed, some/all kept. Should see files appear at:

```powershell
Get-ChildItem d:\GitHub\GPE-Practice\data\questions\b056-two-sum\cases
```

- [ ] **Step 5: Verify the newly-generated cases agree with reference**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm run-reference --question-id b056-two-sum
```

Expected: all of sample-01 + generated-001 + generated-002 + generated-007 + generated-042 + generated-100 should print OK.

- [ ] **Step 6: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add data/questions/b056-two-sum/
git commit -m "feat(data): b056-two-sum reference solution + 5 generated seeds + generators"
```

This commit will include the LLM-generated `generators/generator.cpp` + `generators/validator.cpp` + `generators/constraints.md` from Task 1 Step 4 too (they live under `data/questions/b056-two-sum/generators/`), plus the new `cases/generated-*.in/.out`. Multi-purpose commit; mention in the message.

---

## Task 5: PR-diff helper — `tools/detect-changed-questions.mjs`

**Files:**
- Create: `tools/detect-changed-questions.mjs`

Simple Node helper: takes the list of changed files (from `gh pr diff --name-only` or `git diff --name-only base...head`), extracts `data/questions/<id>/...` paths, prints unique question ids one per line. Used by `validate-pr.yml`.

- [ ] **Step 1: Create `tools/detect-changed-questions.mjs`**

```js
#!/usr/bin/env node
/**
 * Reads stdin (newline-separated file paths from `git diff --name-only`),
 * extracts unique question ids touched under `data/questions/<id>/...`,
 * prints one id per line on stdout.
 *
 * Used by validate-pr.yml to find which questions to verify.
 */
import { readFileSync } from 'node:fs'

const text = readFileSync(0, 'utf8')
const ids = new Set()
for (const line of text.split(/\r?\n/)) {
  const m = line.trim().match(/^data\/questions\/([^/]+)\//)
  if (m) ids.add(m[1])
}
for (const id of Array.from(ids).sort()) console.log(id)
```

- [ ] **Step 2: Sanity-test locally**

```powershell
"data/questions/b056-two-sum/meta.json
data/questions/a013-fibonacci/cases/sample-01.in
app/src/App.tsx
data/questions/b056-two-sum/cases/sample-01.in" | node d:/GitHub/GPE-Practice/tools/detect-changed-questions.mjs
```

Expected output:
```
a013-fibonacci
b056-two-sum
```

- [ ] **Step 3: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/detect-changed-questions.mjs
git commit -m "feat(tools): detect-changed-questions.mjs (PR diff → unique question ids)"
```

---

## Task 6: Cleanup — guard `tools/build-manifest.ts`'s `main()` call

**Files:**
- Modify: `tools/build-manifest.ts`

A small follow-up from Phase 2: the `main()` call at the bottom runs even when the module is imported by `build-manifest.test.ts`. Harmless but messy. Guard it.

- [ ] **Step 1: Edit `tools/build-manifest.ts`**

Find the existing `main()` call at the bottom and replace with:

```ts
// Run main() only when this file is the script being executed, not when
// imported (e.g., by build-manifest.test.ts).
const isMain = import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href
if (isMain) main()
```

The Windows path normalization is a small wart; without it `import.meta.url` (which uses `/` on Windows too) won't match `process.argv[1]` (which uses `\`).

- [ ] **Step 2: Verify nothing broke**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm build-manifest
pnpm exec vitest run
```

Both must pass. The manifest builder still works when run as a script; tests no longer trigger a manifest re-emission as a side effect.

- [ ] **Step 3: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add tools/build-manifest.ts
git commit -m "chore(tools): guard build-manifest main() against module-import side effect"
```

---

## Task 7: `validate-pr.yml` workflow

**Files:**
- Create: `.github/workflows/validate-pr.yml`

- [ ] **Step 1: Create `.github/workflows/validate-pr.yml`**

```yaml
name: validate-pr

on:
  pull_request:
    paths:
      - 'data/questions/**'

permissions:
  contents: read
  pull-requests: write

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: false
          fetch-depth: 0   # need full history to diff against base

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Enable Corepack (pnpm)
        run: corepack enable

      - name: Install tools deps
        working-directory: tools
        run: pnpm install --frozen-lockfile

      - name: Detect changed questions
        id: changed
        run: |
          set -e
          base="${{ github.event.pull_request.base.sha }}"
          head="${{ github.event.pull_request.head.sha }}"
          diff_files=$(git diff --name-only "$base" "$head")
          ids=$(echo "$diff_files" | node tools/detect-changed-questions.mjs)
          echo "Changed questions:"
          echo "$ids"
          # Multi-line GITHUB_OUTPUT
          {
            echo "ids<<EOF"
            echo "$ids"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Validate question schemas
        if: steps.changed.outputs.ids != ''
        working-directory: tools
        run: pnpm validate-question ${{ steps.changed.outputs.ids }}

      - name: Compile reference + run against all cases (per question)
        if: steps.changed.outputs.ids != ''
        working-directory: tools
        run: |
          set -e
          for id in ${{ steps.changed.outputs.ids }}; do
            echo "=== $id ==="
            pnpm run-reference --question-id "$id"
          done
```

- [ ] **Step 2: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add .github/workflows/validate-pr.yml
git commit -m "ci: validate-pr workflow (schema + reference round-trip)"
```

---

## Task 8: `register-new-question.yml` workflow

**Files:**
- Create: `.github/workflows/register-new-question.yml`

Triggered when a PR is labeled `new-question`, OR on maintainer `workflow_dispatch` with a `question-id` input. Calls the LLM, generates cases, commits back to the PR branch.

- [ ] **Step 1: Create `.github/workflows/register-new-question.yml`**

```yaml
name: register-new-question

on:
  pull_request:
    types: [labeled, synchronize]
  workflow_dispatch:
    inputs:
      question-id:
        description: 'Question id (folder name under data/questions/)'
        required: true
        type: string

permissions:
  contents: write
  pull-requests: write

jobs:
  generate:
    # Fire on PR only when the new-question label is set, or on manual dispatch
    if: >
      (github.event_name == 'workflow_dispatch') ||
      (github.event_name == 'pull_request' &&
       contains(github.event.pull_request.labels.*.name, 'new-question'))
    runs-on: ubuntu-latest
    env:
      LLM_BASE_URL: ${{ vars.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/' }}
      LLM_API_KEY:  ${{ secrets.LLM_API_KEY }}
      LLM_MODEL:    ${{ vars.LLM_MODEL || 'gemini-3.1-flash-lite' }}
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: false
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.ref || github.ref }}

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Enable Corepack (pnpm)
        run: corepack enable

      - name: Install tools deps
        working-directory: tools
        run: pnpm install --frozen-lockfile

      - name: Detect target question id(s)
        id: qids
        run: |
          set -e
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "ids=${{ inputs.question-id }}" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          base="${{ github.event.pull_request.base.sha }}"
          head="${{ github.event.pull_request.head.sha }}"
          ids=$(git diff --name-only "$base" "$head" | node tools/detect-changed-questions.mjs | tr '\n' ' ')
          echo "ids=$ids" >> "$GITHUB_OUTPUT"

      - name: LLM emit generator + validator
        if: steps.qids.outputs.ids != ''
        working-directory: tools
        run: |
          set -e
          for id in ${{ steps.qids.outputs.ids }}; do
            echo "=== llm-emit-generator: $id ==="
            pnpm llm-emit-generator --question-id "$id"
          done

      - name: Generate cases via reference
        if: steps.qids.outputs.ids != ''
        working-directory: tools
        run: |
          set -e
          for id in ${{ steps.qids.outputs.ids }}; do
            echo "=== run-generator-and-reference: $id ==="
            pnpm run-generator-and-reference --question-id "$id"
          done

      - name: Commit & push generators + generated cases
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore(cases): regenerate generators + cases for new-question PR'
          file_pattern: 'data/questions/**/generators/* data/questions/**/cases/generated-*'
```

- [ ] **Step 2: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add .github/workflows/register-new-question.yml
git commit -m "ci: register-new-question workflow (LLM emits generator + cases)"
```

---

## Task 9: `regenerate-cases.yml` workflow

**Files:**
- Create: `.github/workflows/regenerate-cases.yml`

Maintainer dispatch only. Reuses existing committed `generator.cpp` + `validator.cpp` + `reference.cpp` — no LLM call. For when reference is fixed or seeds expand.

- [ ] **Step 1: Create `.github/workflows/regenerate-cases.yml`**

```yaml
name: regenerate-cases

on:
  workflow_dispatch:
    inputs:
      question-id:
        description: 'Question id (folder name under data/questions/)'
        required: true
        type: string

permissions:
  contents: write

jobs:
  regenerate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { submodules: false, fetch-depth: 1 }

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Enable Corepack (pnpm)
        run: corepack enable

      - name: Install tools deps
        working-directory: tools
        run: pnpm install --frozen-lockfile

      - name: Regenerate cases (no LLM)
        working-directory: tools
        run: pnpm run-generator-and-reference --question-id ${{ inputs['question-id'] }}

      - name: Commit & push
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore(cases): regenerate cases for ${{ inputs['question-id'] }}'
          file_pattern: 'data/questions/${{ inputs['question-id'] }}/cases/generated-*'
```

- [ ] **Step 2: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add .github/workflows/regenerate-cases.yml
git commit -m "ci: regenerate-cases workflow (maintainer dispatch, no LLM)"
```

---

## Task 10: Final verify + tag

- [ ] **Step 1: Clean install + full pipeline (apps unchanged but make sure nothing broke)**

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

All must pass.

- [ ] **Step 2: Verify all four `tools/` scripts still work end-to-end on b056-two-sum**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm validate-question b056-two-sum
pnpm build-manifest
pnpm run-reference --question-id b056-two-sum
pnpm run-generator-and-reference --question-id b056-two-sum
pnpm exec vitest run
```

The vitest run should still pass with whatever count it was at (the `main()` guard from Task 6 may have affected the side-effect-on-import behavior but tests should still work).

- [ ] **Step 3: Confirm clean git status**

```powershell
cd d:\GitHub\GPE-Practice
git status
```

Expected: clean.

- [ ] **Step 4: Tag**

```bash
cd d:\GitHub\GPE-Practice
git tag phase-6-ci-workflows-complete
git log --oneline -25
```

---

## Definition of Done for Phase 6

- [ ] `tools/llm-emit-generator.ts` — production LLM script with .env loading; tested end-to-end against b056-two-sum.
- [ ] `tools/run-generator-and-reference.ts` — compiles gen + val + ref natively; for each seed runs gen → val → (if valid) ref; writes generated-NNN.in/.out.
- [ ] `tools/run-reference.ts` — compiles + runs reference against every case; exits 1 on any mismatch.
- [ ] `tools/detect-changed-questions.mjs` — turns git diff into a list of question ids.
- [ ] `data/questions/b056-two-sum/solutions/reference.cpp` — a real working two-sum reference.
- [ ] `data/questions/b056-two-sum/meta.json` — has 5 seeds in `generatedSeeds`.
- [ ] All generated artifacts for b056 committed (`generators/*`, `cases/generated-*.in/.out`).
- [ ] `.github/workflows/{validate-pr,register-new-question,regenerate-cases}.yml` all exist and pass yaml-parse smoke test.
- [ ] `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build` all clean.
- [ ] Tag `phase-6-ci-workflows-complete` exists.

After Phase 6, Phase 7 (seed first 10 GPE questions for real) is the remaining work to reach the v1 "done" criteria in spec §14.

---

## Manual verification after merge

The workflows can only be fully tested by an actual PR landing on `origin/main`. After the maintainer pushes Phase 6:

1. Visit repo Settings → Secrets and variables → Actions:
   - Add secret `LLM_API_KEY` (the Gemini key)
   - Add variables `LLM_BASE_URL` + `LLM_MODEL` (or accept the defaults baked into the workflow)
2. Open a small test PR touching `data/questions/b056-two-sum/cases/sample-01.in` (e.g., add a trailing newline). Confirm `validate-pr` runs and passes.
3. Open a second test PR adding a tiny new question; apply the `new-question` label; watch `register-new-question` add the generators + cases.
4. Run `regenerate-cases` from the Actions tab with `question-id: b056-two-sum`; confirm new cases land on `main`.

---

## What to do if you're stuck

- **`gh-auto-commit-action` fails with "no changes"**: that means the LLM emitted nothing different from what's on disk (or the script bailed). Inspect the workflow logs.
- **LLM emits invalid JSON**: the script exits 1 with the offending content printed. Most likely cause is a model that doesn't honor `response_format: json_object` — switch via `vars.LLM_MODEL` or fall back to a more capable model.
- **`g++` not found in the runner**: `ubuntu-latest` ships gcc-13. If it ever changes, add `sudo apt-get install -y g++` to the workflow.
- **`stefanzweifel/git-auto-commit-action` push fails with 403**: the workflow needs `permissions: { contents: write, pull-requests: write }` at the job level. Already included.
- **Schema validation fails on a freshly LLM-generated question**: the new-question PR's `meta.json` is hand-authored by the contributor (Journey C form). LLM only fills generator/validator/constraints. If schema fails, the contributor needs to fix `meta.json`; the LLM script doesn't touch it.
