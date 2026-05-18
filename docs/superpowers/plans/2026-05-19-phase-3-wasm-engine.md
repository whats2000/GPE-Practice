# Phase 3 — WASM C++ Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the emception WASM C++ toolchain (validated in Phase 0) into the app at `app/src/engine/{compiler.ts, runtime.ts, judge.ts}`. End state: a clean `Compiler.compile()` + `Runtime.run()` + `judge()` pipeline that the IDE (Phase 4) can call to compile user C++, execute it against a test case, and produce a verdict. Runs entirely in the browser via a Web Worker; supports the two-tier `-O0`/`-O2` optimization contract; memoizes by source hash in IndexedDB.

**Architecture:**
- `engine/judge.ts` — pure functions (exact / whitespace-normalized / float-tolerant). No I/O. Easy to test in jsdom.
- `engine/runtime.ts` — runs a compiled `Uint8Array` wasm binary with `stdin` text; returns `{stdout, stderr, exitCode, ms}` or TLE. Implements a WASI shim (ported from the Phase 0 spike harness).
- `engine/compiler.ts` — owns the emception Worker (wrapped via Comlink), polyfills `<bits/stdc++.h>` into emception's virtual FS at init, runs `em++` with the right flags per optimization tier, returns wasm bytes. Caches compiled bytes by `SHA-256(source + opt)` in IndexedDB.
- `engine/registerCoi.ts` — registers `coi-serviceworker` for the COOP/COEP headers GitHub Pages won't send.
- `app/public/emception/` — the static emception artifacts (worker bundle + sysroot + libs). NOT committed (gitignored, large). A maintainer-runnable script in `tools/` downloads them.
- `app/public/coi-serviceworker.js` — vendored or generated.

**Tech Stack:** Comlink 4.x (Worker RPC), `idb` ^8 (typed IndexedDB wrapper), Web Crypto API (`crypto.subtle.digest` for SHA-256, available in all modern browsers + secure contexts). The emception worker bundle itself is already self-contained from the Phase 0 spike.

**Out of scope for Phase 3:** Monaco editor, IDE layouts, the Practice vs Exam Mode tabs, the "Run vs Submit" buttons (Phase 4); compile-time stress test or LLM-driven case generation (Phase 6); contribution forms (Phase 5).

**Trust boundary inherited from Phase 0:** the emception bundle works end-to-end on our sample.cpp with the bits/stdc++.h polyfill and `-sSTANDALONE_WASM=1`. We're porting that working code, not re-validating the toolchain.

---

## Files Created/Modified

- Create: `app/src/engine/judge.ts`
- Create: `app/src/engine/judge.test.ts`
- Create: `app/src/engine/runtime.ts`
- Create: `app/src/engine/runtime.test.ts`
- Create: `app/src/engine/compiler.ts`
- Create: `app/src/engine/compiler.test.ts`
- Create: `app/src/engine/wasiShim.ts` (extracted WASI fd_read/fd_write helpers, shared by runtime + tests)
- Create: `app/src/engine/cache.ts` (IndexedDB memoization)
- Create: `app/src/engine/cache.test.ts`
- Create: `app/src/engine/registerCoi.ts`
- Create: `app/src/engine/bits-stdcpp-polyfill.ts` (the polyfill string as a const)
- Create: `app/src/engine/index.ts` (barrel)
- Create: `app/public/coi-serviceworker.js` (vendored from gzuidhof/coi-serviceworker)
- Create: `tools/download-emception.ts` (maintainer-runnable; mirrors spike behavior)
- Modify: `app/public/.gitignore` (ignore `emception/`)
- Modify: `app/package.json` (add `idb`, `comlink` deps)
- Modify: `app/src/main.tsx` (register coi-serviceworker before mount)
- Modify: `tools/package.json` (add the download script entry)
- Reference: copy or adapt from `spike/wasm-toolchain/emception/driver.js` — known-working source.

---

## Task 1: Pure `judge.ts` (start with what doesn't need a browser)

**Files:**
- Create: `app/src/engine/judge.ts`
- Create: `app/src/engine/judge.test.ts`

- [ ] **Step 1: Create `app/src/engine/judge.ts`**

```ts
import type { JudgeMode } from '@/data/schema'

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE'

export interface JudgeInput {
  expected: string
  actual: string
  mode: JudgeMode
}

/**
 * Compare actual program output against expected output per the question's judge mode.
 * Returns 'AC' if outputs match, 'WA' otherwise.
 *
 * This function only decides AC vs WA. TLE / RE are decided by the runtime layer
 * (timeout, non-zero exit, exception) and shouldn't reach here.
 */
export function judge(input: JudgeInput): 'AC' | 'WA' {
  const { expected, actual, mode } = input
  switch (mode.mode) {
    case 'exact':
      return expected === actual ? 'AC' : 'WA'
    case 'whitespace':
      return normalizeWhitespace(expected) === normalizeWhitespace(actual) ? 'AC' : 'WA'
    case 'float':
      return compareFloatTokens(expected, actual, mode.eps) ? 'AC' : 'WA'
  }
}

/**
 * Strip trailing whitespace per line + trailing blank lines, then compare.
 * Matches what most school OJs (and our spec §6.2) define as 'whitespace' mode.
 */
export function normalizeWhitespace(s: string): string {
  const lines = s.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

/**
 * Tokenize on whitespace, compare token-by-token.
 * Numeric tokens are compared as numbers within `eps`; non-numeric tokens compared as strings.
 * Token counts must match.
 */
export function compareFloatTokens(expected: string, actual: string, eps: number): boolean {
  const exp = expected.trim().split(/\s+/).filter(Boolean)
  const act = actual.trim().split(/\s+/).filter(Boolean)
  if (exp.length !== act.length) return false
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i]
    const a = act[i]
    const en = Number(e)
    const an = Number(a)
    const bothNumeric = !Number.isNaN(en) && !Number.isNaN(an)
    if (bothNumeric) {
      if (Math.abs(en - an) > eps) return false
    } else if (e !== a) {
      return false
    }
  }
  return true
}
```

- [ ] **Step 2: Create `app/src/engine/judge.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { judge, normalizeWhitespace, compareFloatTokens } from './judge'

describe('normalizeWhitespace', () => {
  it('strips trailing spaces/tabs per line', () => {
    expect(normalizeWhitespace('a  \nb\t\n')).toBe('a\nb')
  })

  it('drops trailing blank lines', () => {
    expect(normalizeWhitespace('a\n\n\n')).toBe('a')
  })

  it('treats CRLF and LF identically', () => {
    expect(normalizeWhitespace('a\r\nb\r\n')).toBe('a\nb')
  })

  it('preserves internal whitespace', () => {
    expect(normalizeWhitespace('a  b')).toBe('a  b')
  })
})

describe('compareFloatTokens', () => {
  it('matches identical numbers exactly', () => {
    expect(compareFloatTokens('1 2 3', '1 2 3', 1e-6)).toBe(true)
  })

  it('matches numbers within eps', () => {
    expect(compareFloatTokens('1.0', '1.00000001', 1e-6)).toBe(true)
  })

  it('rejects numbers outside eps', () => {
    expect(compareFloatTokens('1.0', '1.01', 1e-6)).toBe(false)
  })

  it('compares non-numeric tokens as strings', () => {
    expect(compareFloatTokens('OK 1.5', 'OK 1.50001', 1e-3)).toBe(true)
    expect(compareFloatTokens('OK 1.5', 'NO 1.5', 1e-3)).toBe(false)
  })

  it('rejects mismatched token counts', () => {
    expect(compareFloatTokens('1 2', '1 2 3', 1e-6)).toBe(false)
  })
})

describe('judge', () => {
  it('exact mode: byte-equal AC', () => {
    expect(judge({ expected: '14\n1\n', actual: '14\n1\n', mode: { mode: 'exact' } })).toBe('AC')
  })

  it('exact mode: byte-different WA (trailing space differs)', () => {
    expect(judge({ expected: '14\n', actual: '14 \n', mode: { mode: 'exact' } })).toBe('WA')
  })

  it('whitespace mode: trailing space tolerated', () => {
    expect(
      judge({ expected: '14\n1\n', actual: '14 \n1\n\n', mode: { mode: 'whitespace' } }),
    ).toBe('AC')
  })

  it('whitespace mode: token order matters', () => {
    expect(judge({ expected: '1 2\n', actual: '2 1\n', mode: { mode: 'whitespace' } })).toBe('WA')
  })

  it('float mode: tolerance applied', () => {
    expect(
      judge({ expected: '3.14159', actual: '3.14158', mode: { mode: 'float', eps: 1e-4 } }),
    ).toBe('AC')
  })
})
```

- [ ] **Step 3: Run tests, expect 14 new pass (29 total: 15 + 14)**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

If anything fails, STOP and report. Do not modify tests.

- [ ] **Step 4: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/engine/
git commit -m "feat(engine): pure judge functions (exact / whitespace / float) + tests"
```

---

## Task 2: IndexedDB memoization cache

**Files:**
- Create: `app/src/engine/cache.ts`
- Create: `app/src/engine/cache.test.ts`
- Modify: `app/package.json` (add `idb`)

- [ ] **Step 1: Add `idb` dep**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add idb@^8.0.0
```

`idb` is a tiny typed wrapper around IndexedDB. Used by VS Code, Google, etc. — mature.

- [ ] **Step 2: Create `app/src/engine/cache.ts`**

```ts
import { openDB, type IDBPDatabase, type DBSchema } from 'idb'

interface CompileCacheSchema extends DBSchema {
  compiled: {
    key: string                              // SHA-256 hex of source + opt
    value: {
      key: string
      wasm: Uint8Array
      lastAccessed: number
    }
    indexes: { 'by-lastAccessed': number }
  }
}

const DB_NAME = 'gpe-engine-cache'
const DB_VERSION = 1
const STORE = 'compiled' as const
const MAX_ENTRIES = 100

let dbPromise: Promise<IDBPDatabase<CompileCacheSchema>> | null = null

function getDb(): Promise<IDBPDatabase<CompileCacheSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CompileCacheSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('by-lastAccessed', 'lastAccessed')
      },
    })
  }
  return dbPromise
}

export async function hashSource(source: string, opt: string): Promise<string> {
  const data = new TextEncoder().encode(`${opt}\n${source}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function getCached(key: string): Promise<Uint8Array | null> {
  const db = await getDb()
  const row = await db.get(STORE, key)
  if (!row) return null
  // Touch lastAccessed so this entry survives LRU eviction
  row.lastAccessed = Date.now()
  await db.put(STORE, row)
  return row.wasm
}

export async function putCached(key: string, wasm: Uint8Array): Promise<void> {
  const db = await getDb()
  await db.put(STORE, { key, wasm, lastAccessed: Date.now() })
  await evictIfOver(db, MAX_ENTRIES)
}

async function evictIfOver(
  db: IDBPDatabase<CompileCacheSchema>,
  cap: number,
): Promise<void> {
  const count = await db.count(STORE)
  if (count <= cap) return
  const toRemove = count - cap
  // openCursor on the lastAccessed index in ascending order = oldest first
  const tx = db.transaction(STORE, 'readwrite')
  const index = tx.store.index('by-lastAccessed')
  let cursor = await index.openCursor()
  let removed = 0
  while (cursor && removed < toRemove) {
    await cursor.delete()
    removed++
    cursor = await cursor.continue()
  }
  await tx.done
}

/** Test helper — wipe the store. Browser tests only. */
export async function _clearForTests(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}
```

- [ ] **Step 3: Add `fake-indexeddb` to devDeps for jsdom testing**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add -D fake-indexeddb@^6.0.0
```

`fake-indexeddb` shims the IndexedDB API in Node/jsdom so cache logic can be unit-tested without a real browser.

- [ ] **Step 4: Extend `app/src/test-setup.ts` to load fake-indexeddb**

Read the current `app/src/test-setup.ts`. If it only has the jest-dom import, append the fake-indexeddb import:

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

The `auto` entry point installs global `indexedDB` + related types.

- [ ] **Step 5: Create `app/src/engine/cache.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { hashSource, getCached, putCached, _clearForTests } from './cache'

describe('hashSource', () => {
  it('is deterministic', async () => {
    const a = await hashSource('int main(){return 0;}', 'O0')
    const b = await hashSource('int main(){return 0;}', 'O0')
    expect(a).toBe(b)
  })

  it('differs when optimization differs', async () => {
    const o0 = await hashSource('int main(){return 0;}', 'O0')
    const o2 = await hashSource('int main(){return 0;}', 'O2')
    expect(o0).not.toBe(o2)
  })

  it('produces 64 hex chars (SHA-256)', async () => {
    const h = await hashSource('x', 'O0')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('IDB cache', () => {
  beforeEach(async () => {
    await _clearForTests()
  })

  it('round-trips wasm bytes by key', async () => {
    const key = 'abc'
    const wasm = new Uint8Array([0, 1, 2, 3])
    expect(await getCached(key)).toBeNull()
    await putCached(key, wasm)
    const got = await getCached(key)
    expect(got).toEqual(wasm)
  })

  it('returns null for missing keys', async () => {
    expect(await getCached('does-not-exist')).toBeNull()
  })
})
```

- [ ] **Step 6: Run tests — expect 5 new pass (34 total)**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

Likely pitfall: if fake-indexeddb's setup doesn't trigger before module init, the test will throw `indexedDB is not defined`. The `fake-indexeddb/auto` import in `test-setup.ts` runs before tests because Vitest's `setupFiles` configuration loads it first.

If you see "Web Crypto API not available", the runtime in jsdom is Node 20+, which has `globalThis.crypto.subtle`. Verify with `console.log(typeof crypto.subtle.digest)` — should be `'function'`.

- [ ] **Step 7: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/src/engine/cache.ts app/src/engine/cache.test.ts app/src/test-setup.ts
git commit -m "feat(engine): IDB-backed compile cache with SHA-256 source hashing + LRU eviction"
```

---

## Task 3: Maintainer script to download emception artifacts

**Files:**
- Create: `tools/download-emception.ts`
- Modify: `tools/package.json` (add the script entry)
- Modify: `app/public/.gitignore` (or create) — ignore `emception/`

- [ ] **Step 1: Reference the working Phase 0 manifest**

Read `spike/wasm-toolchain/emception/MANIFEST.md` (committed during the Phase 0 pivot) — it documents the exact hashed URLs and required files. The download script mirrors that logic.

- [ ] **Step 2: Create `tools/download-emception.ts`**

The script downloads from `https://jprendes.github.io/emception/` into `d:/GitHub/GPE-Practice/app/public/emception/`. List of files (verbatim from spike's MANIFEST.md):

```ts
#!/usr/bin/env tsx
/**
 * Download the pre-built emception artifacts from jprendes.github.io into
 * app/public/emception/ so the SPA can self-host them (avoids cross-origin
 * Worker + COOP/COEP issues).
 *
 * Runs locally and in CI before `pnpm build`. The result is gitignored;
 * re-running this script is the canonical refresh path.
 *
 * Source manifest: see spike/wasm-toolchain/emception/MANIFEST.md.
 */
import { writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT_DIR = join(REPO_ROOT, 'app', 'public', 'emception')

const BASE = 'https://jprendes.github.io/emception'
const COMLINK_URL = 'https://unpkg.com/comlink@4.4.1/dist/esm/comlink.mjs'

// Verbatim from the Phase 0 spike MANIFEST.md
const ARTIFACTS = [
  // Worker bundle
  'emception.worker.bundle.worker.js',

  // Root pack (llvm-box + binaryen + python + quicknode wasms)
  'cecdfcda360457a8f204.br',

  // Tool wasms (referenced by the worker bundle by webpack hash)
  'f0283badd42fe745cbe4.wasm',  // wasm-package
  '9d1e542b80004e27297f.wasm',  // brotli

  // GL / html5 libs (added in the spike — required by hardcoded link line)
  '94c22103400127179679.a',     // libGL.a
  '5de9254458072f582a9c.a',     // libhtml5.a

  // (The 44 essential sysroot .a files are also required; they are listed below.)
]

// 44 essential sysroot .a hashes from MANIFEST.md. If MANIFEST.md is missing
// any, error out — don't guess.
const SYSROOT_LIBS: string[] = [
  // TODO: paste the 44 hashes from spike/wasm-toolchain/emception/MANIFEST.md
  // before running. The script `validateManifest()` below errors loudly if any
  // are missing, so an incomplete list will be caught.
]

async function readSpikeManifest(): Promise<string[]> {
  const manifestPath = join(REPO_ROOT, 'spike', 'wasm-toolchain', 'emception', 'MANIFEST.md')
  if (!existsSync(manifestPath)) {
    throw new Error(`Cannot find ${manifestPath} — was Phase 0 spike committed?`)
  }
  const md = await import('node:fs/promises').then((f) => f.readFile(manifestPath, 'utf8'))
  // Pull out lines that look like `xxxxxxxxxxxxxxxxxxxx.a` from the manifest.
  // The exact format depends on what was written in Phase 0; adjust the regex
  // to match. The point: don't hardcode 44 hashes here; read from the source.
  const matches = md.match(/[a-f0-9]{20}\.a/g) ?? []
  return Array.from(new Set(matches))
}

async function downloadOne(url: string, dest: string): Promise<number> {
  if (existsSync(dest)) {
    const s = await stat(dest)
    if (s.size > 0) return s.size  // already cached
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch ${url} → HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return buf.byteLength
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // Comlink (direct from unpkg)
  console.log('Downloading Comlink…')
  await downloadOne(COMLINK_URL, join(OUT_DIR, 'comlink.mjs'))

  // emception artifacts
  console.log('Downloading emception worker + tool wasms…')
  for (const name of ARTIFACTS) {
    const size = await downloadOne(`${BASE}/${name}`, join(OUT_DIR, name))
    console.log(`  ${name}  (${size} bytes)`)
  }

  // Sysroot libs — read the canonical list from the spike's MANIFEST.md
  console.log('Downloading sysroot .a libs (hashes from spike MANIFEST.md)…')
  const libs = await readSpikeManifest()
  if (libs.length < 40) {
    throw new Error(`Found only ${libs.length} sysroot libs in MANIFEST.md; expected ~46`)
  }
  for (const lib of libs) {
    const size = await downloadOne(`${BASE}/${lib}`, join(OUT_DIR, lib))
    console.log(`  ${lib}  (${size} bytes)`)
  }

  console.log(`\nDone. Artifacts in ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

NOTE: The script reads the canonical list of sysroot `.a` hashes from the Phase 0 spike's `MANIFEST.md` so we don't duplicate the hash list. If the regex doesn't match the manifest's actual format, adjust it. Print which libs were found and how many.

- [ ] **Step 3: Add the script entry to `tools/package.json`**

Edit the `"scripts"` section, append:

```json
"download-emception": "tsx download-emception.ts"
```

- [ ] **Step 4: Create `app/public/.gitignore` (or modify existing)**

```
# Downloaded by tools/download-emception.ts; large (~60 MB) and not committed.
emception/
```

- [ ] **Step 5: Run the download script**

```powershell
cd d:\GitHub\GPE-Practice\tools
pnpm download-emception
```

Expected:
- Comlink downloaded (~12 KB)
- 6 emception artifacts downloaded (~25 MB)
- 44+ sysroot `.a` files downloaded (~30 MB)
- Total ~60 MB in `app/public/emception/`

If the spike MANIFEST.md format doesn't match the regex, adjust the regex in `readSpikeManifest()` and re-run. The script is idempotent (skips already-downloaded files).

If anything fails to download (404), STOP and inspect the spike's `.cache/` directory under `spike/wasm-toolchain/emception/.cache/` — those are the canonical filenames.

- [ ] **Step 6: Verify the download**

```powershell
$dir = 'd:\GitHub\GPE-Practice\app\public\emception'
Get-ChildItem $dir | Measure-Object -Property Length -Sum
```

Expected: ~50+ files, ~60 MB total.

- [ ] **Step 7: Commit (script + gitignore only — NOT the downloaded artifacts)**

```bash
cd d:\GitHub\GPE-Practice
git add tools/download-emception.ts tools/package.json app/public/.gitignore
git status   # confirm .cache/ and emception/ NOT staged
git commit -m "feat(tools): script to download emception artifacts into app/public/"
```

---

## Task 4: COOP/COEP service worker registration

**Files:**
- Create: `app/public/coi-serviceworker.js`
- Create: `app/src/engine/registerCoi.ts`
- Modify: `app/src/main.tsx`

- [ ] **Step 1: Fetch the latest `coi-serviceworker` and vendor it into `app/public/`**

Source: https://github.com/gzuidhof/coi-serviceworker (single ~5 KB file, MIT licensed).

```powershell
$dest = 'd:\GitHub\GPE-Practice\app\public\coi-serviceworker.js'
Invoke-WebRequest 'https://raw.githubusercontent.com/gzuidhof/coi-serviceworker/master/coi-serviceworker.js' -OutFile $dest -UseBasicParsing
Get-Item $dest | Select-Object Length
```

Expected: ~5-10 KB. Inspect the first few lines — should contain MIT license header.

- [ ] **Step 2: Create `app/src/engine/registerCoi.ts`**

```ts
/**
 * Register the COI service worker (gzuidhof/coi-serviceworker), which
 * synthesizes COOP + COEP headers client-side. GitHub Pages can't send these
 * headers, but emception needs `crossOriginIsolated === true` to use
 * SharedArrayBuffer.
 *
 * On the first ever page load, the SW registers and the page is reloaded once
 * to pick up the synthesized headers. After that, every subsequent visit has
 * isolation immediately.
 */
export async function registerCoiServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  // Skip in tests
  if (import.meta.env.MODE === 'test') return

  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}coi-serviceworker.js`)
  } catch (e) {
    console.warn('[gpe] coi-serviceworker failed to register:', e)
  }
}
```

- [ ] **Step 3: Wire it into `app/src/main.tsx`**

Insert a call to `registerCoiServiceWorker()` BEFORE `ReactDOM.createRoot(...).render(...)`. The SW load is fire-and-forget; we don't block render on it because the COI reload (if needed) happens after first load.

Edit `app/src/main.tsx` — find the existing structure and add:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerCoiServiceWorker } from './engine/registerCoi'
import './i18n'
import './index.css'

registerCoiServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 4: Verify the file exists at the right serve path**

`coi-serviceworker.js` MUST be in `app/public/` so Vite serves it at `/coi-serviceworker.js` (root-relative). Service worker scope is determined by the script URL — placing it at root scopes it to the whole site.

```powershell
Test-Path d:\GitHub\GPE-Practice\app\public\coi-serviceworker.js
```

- [ ] **Step 5: Verify dev server + build still pass**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
pnpm test
pnpm build
```

All three must pass. Note: the SW registration code doesn't run in jsdom (`import.meta.env.MODE === 'test'` short-circuits), so tests are unaffected.

- [ ] **Step 6: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/public/coi-serviceworker.js app/src/engine/registerCoi.ts app/src/main.tsx
git commit -m "feat(engine): register coi-serviceworker for COOP/COEP on GitHub Pages"
```

---

## Task 5: `<bits/stdc++.h>` polyfill module

**Files:**
- Create: `app/src/engine/bits-stdcpp-polyfill.ts`

Very small task — extracting the polyfill from the spike harness into a reusable module.

- [ ] **Step 1: Create `app/src/engine/bits-stdcpp-polyfill.ts`**

```ts
/**
 * libc++ doesn't ship a `<bits/stdc++.h>` convenience header (that's a libstdc++
 * convention). GPE-style code relies on it heavily.
 *
 * Solution: install this string into emception's virtual filesystem at
 * /working/bits/stdc++.h at init time, then pass `-I/working` to em++.
 *
 * Spike validation: Phase 0 confirmed this polyfill compiles sample.cpp
 * successfully against emception's libc++.
 */
export const BITS_STDCPP_POLYFILL = `// bits/stdc++.h polyfill for libc++. Includes the common standard headers
// that competitive-programming and GPE-style code expects to be available.
#pragma once
#include <cassert>
#include <cctype>
#include <cerrno>
#include <cfloat>
#include <climits>
#include <clocale>
#include <cmath>
#include <csetjmp>
#include <csignal>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cwchar>
#include <cwctype>
#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <chrono>
#include <complex>
#include <deque>
#include <exception>
#include <forward_list>
#include <fstream>
#include <functional>
#include <initializer_list>
#include <iomanip>
#include <ios>
#include <iosfwd>
#include <iostream>
#include <istream>
#include <iterator>
#include <limits>
#include <list>
#include <locale>
#include <map>
#include <memory>
#include <new>
#include <numeric>
#include <ostream>
#include <queue>
#include <random>
#include <ratio>
#include <regex>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <streambuf>
#include <string>
#include <tuple>
#include <type_traits>
#include <typeindex>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <valarray>
#include <vector>
`
```

- [ ] **Step 2: Verify lint clean**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/engine/bits-stdcpp-polyfill.ts
git commit -m "feat(engine): bits/stdc++.h polyfill module (vendored from Phase 0 spike)"
```

---

## Task 6: WASI shim + Runtime

**Files:**
- Create: `app/src/engine/wasiShim.ts`
- Create: `app/src/engine/runtime.ts`
- Create: `app/src/engine/runtime.test.ts`

The WASI shim is ported verbatim from the Phase 0 spike at `spike/wasm-toolchain/emception/driver.js` (which is committed). Read that file first.

- [ ] **Step 1: Read the working spike implementation**

```powershell
Get-Content d:\GitHub\GPE-Practice\spike\wasm-toolchain\emception\driver.js -Raw | Select-String -Pattern 'wasi_snapshot_preview1' -Context 0,100
```

Locate the `wasiImports` block. The shim implements: `fd_read`, `fd_write`, `proc_exit`, `fd_close`, `fd_seek`, `fd_fdstat_get`, `environ_get`, `environ_sizes_get`, `args_get`, `args_sizes_get`, `clock_time_get`.

- [ ] **Step 2: Create `app/src/engine/wasiShim.ts`**

```ts
/**
 * Minimal WASI shim for `wasi_snapshot_preview1` — enough to run a single
 * standalone wasm program with stdin → stdout/stderr. No filesystem.
 *
 * Ported verbatim from the Phase 0 spike harness at
 * spike/wasm-toolchain/emception/driver.js (proven against emception's
 * `em++ -sSTANDALONE_WASM=1` output).
 */

export interface ShimState {
  stdinBytes: Uint8Array
  stdinPos: number
  stdoutBuf: string
  stderrBuf: string
  startedAt: number
  exited: { code: number } | null
}

export function createShimState(stdin: string): ShimState {
  return {
    stdinBytes: new TextEncoder().encode(stdin),
    stdinPos: 0,
    stdoutBuf: '',
    stderrBuf: '',
    startedAt: performance.now(),
    exited: null,
  }
}

export function makeWasiImports(state: ShimState, getInstance: () => WebAssembly.Instance) {
  const decoder = new TextDecoder()
  const mem = () => new DataView((getInstance().exports.memory as WebAssembly.Memory).buffer)
  const memU8 = () => new Uint8Array((getInstance().exports.memory as WebAssembly.Memory).buffer)

  return {
    wasi_snapshot_preview1: {
      fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
        const view = mem()
        let total = 0
        for (let i = 0; i < iovsLen; i++) {
          const ptr = view.getUint32(iovsPtr + i * 8, true)
          const len = view.getUint32(iovsPtr + i * 8 + 4, true)
          const chunk = decoder.decode(memU8().slice(ptr, ptr + len))
          if (fd === 1) state.stdoutBuf += chunk
          else state.stderrBuf += chunk
          total += len
        }
        mem().setUint32(nwrittenPtr, total, true)
        return 0
      },
      fd_read(fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number): number {
        if (fd !== 0) return 8 // WASI_EBADF
        const view = mem()
        let total = 0
        for (let i = 0; i < iovsLen; i++) {
          const ptr = view.getUint32(iovsPtr + i * 8, true)
          const len = view.getUint32(iovsPtr + i * 8 + 4, true)
          const avail = Math.min(len, state.stdinBytes.length - state.stdinPos)
          memU8().set(state.stdinBytes.subarray(state.stdinPos, state.stdinPos + avail), ptr)
          state.stdinPos += avail
          total += avail
        }
        mem().setUint32(nreadPtr, total, true)
        return 0
      },
      proc_exit(code: number): never {
        state.exited = { code }
        throw new ProcExit(code)
      },
      fd_close(): number {
        return 0
      },
      fd_seek(): number {
        return 70 // WASI_ESPIPE
      },
      fd_fdstat_get(fd: number, statPtr: number): number {
        mem().setUint8(statPtr, fd < 3 ? 2 : 0)
        return 0
      },
      environ_get(): number {
        return 0
      },
      environ_sizes_get(countPtr: number, bufSizePtr: number): number {
        const v = mem()
        v.setUint32(countPtr, 0, true)
        v.setUint32(bufSizePtr, 0, true)
        return 0
      },
      args_get(): number {
        return 0
      },
      args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
        const v = mem()
        v.setUint32(argcPtr, 0, true)
        v.setUint32(argvBufSizePtr, 0, true)
        return 0
      },
      clock_time_get(_id: number, _precision: bigint, timePtr: number): number {
        const ns = BigInt(Math.round(performance.now() * 1e6))
        mem().setBigUint64(timePtr, ns, true)
        return 0
      },
    },
    env: {},
  }
}

export class ProcExit extends Error {
  constructor(public readonly code: number) {
    super(`proc_exit(${code})`)
  }
}
```

- [ ] **Step 3: Create `app/src/engine/runtime.ts`**

```ts
import { createShimState, makeWasiImports, ProcExit } from './wasiShim'

export type RunOutcome =
  | { kind: 'ok';    stdout: string; stderr: string; exitCode: number; ms: number }
  | { kind: 'tle';   partialStdout: string; partialStderr: string; ms: number }
  | { kind: 'crash'; stderr: string; signal: string; ms: number }

export interface Runtime {
  run(wasm: Uint8Array, stdin: string, limitMs: number): Promise<RunOutcome>
}

/**
 * Default runtime: instantiates the wasm module synchronously and runs `_start`.
 * Wall-clock TLE is enforced by a `setTimeout` race; the instance is then
 * discarded (its memory is GC'd). For really long programs the JS thread won't
 * yield, so this approach is approximate — Phase 4's Web Worker host will
 * tighten this by running each program in its own short-lived worker.
 *
 * For Phase 3 (engine layer), main-thread execution is enough to test the
 * WASI shim + judge integration. The Web Worker wrapping comes in Phase 4
 * where it co-locates with the IDE shell.
 */
export const defaultRuntime: Runtime = {
  async run(wasm, stdin, limitMs) {
    const state = createShimState(stdin)
    let instance: WebAssembly.Instance | null = null
    const imports = makeWasiImports(state, () => {
      if (!instance) throw new Error('instance accessed before instantiation')
      return instance
    })

    let didTle = false
    const tleHandle = setTimeout(() => {
      didTle = true
    }, limitMs)

    try {
      const result = await WebAssembly.instantiate(wasm, imports)
      instance = result.instance
      try {
        const start = instance.exports._start as (() => void) | undefined
        if (!start) {
          return {
            kind: 'crash',
            stderr: 'wasm missing _start export',
            signal: 'no-start',
            ms: performance.now() - state.startedAt,
          }
        }
        start()
        // Program returned without proc_exit (exit code 0 by WASI convention)
        return {
          kind: 'ok',
          stdout: state.stdoutBuf,
          stderr: state.stderrBuf,
          exitCode: state.exited?.code ?? 0,
          ms: performance.now() - state.startedAt,
        }
      } catch (e) {
        if (e instanceof ProcExit) {
          return {
            kind: 'ok',
            stdout: state.stdoutBuf,
            stderr: state.stderrBuf,
            exitCode: e.code,
            ms: performance.now() - state.startedAt,
          }
        }
        if (didTle) {
          return {
            kind: 'tle',
            partialStdout: state.stdoutBuf,
            partialStderr: state.stderrBuf,
            ms: performance.now() - state.startedAt,
          }
        }
        return {
          kind: 'crash',
          stderr: (e as Error).message,
          signal: 'exception',
          ms: performance.now() - state.startedAt,
        }
      }
    } finally {
      clearTimeout(tleHandle)
    }
  },
}
```

- [ ] **Step 4: Create `app/src/engine/runtime.test.ts`**

We can't easily instantiate a real wasm program in jsdom unit tests — that requires a real C++ binary, which requires emception, which requires a browser. Phase 3 test coverage of runtime is limited to:
1. WASI shim helpers (the encoded/decoded buffer logic)
2. The state machine for OK / TLE / crash

We can write a tiny mock that doesn't even need WebAssembly.

```ts
import { describe, it, expect } from 'vitest'
import { createShimState } from './wasiShim'

describe('createShimState', () => {
  it('encodes stdin to bytes with UTF-8', () => {
    const s = createShimState('héllo')
    expect(s.stdinBytes.length).toBe(6) // h é(2 bytes) l l o
    expect(s.stdinPos).toBe(0)
  })

  it('starts with empty stdout / stderr buffers', () => {
    const s = createShimState('')
    expect(s.stdoutBuf).toBe('')
    expect(s.stderrBuf).toBe('')
    expect(s.exited).toBeNull()
  })

  it('records startedAt', () => {
    const before = performance.now()
    const s = createShimState('')
    expect(s.startedAt).toBeGreaterThanOrEqual(before)
  })
})

// Note: full end-to-end runtime tests require real wasm and live in Phase 4
// (Playwright browser tests). The shim's correctness was validated by the
// Phase 0 spike's `OUTPUT MATCH: true` on emception's compiled sample.cpp.
```

- [ ] **Step 5: Run tests, expect 3 new pass (37 total)**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

- [ ] **Step 6: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/engine/wasiShim.ts app/src/engine/runtime.ts app/src/engine/runtime.test.ts
git commit -m "feat(engine): WASI shim + Runtime (TLE-aware) — ported from Phase 0 spike"
```

---

## Task 7: Compiler (Comlink + emception worker + memoization + polyfill)

**Files:**
- Create: `app/src/engine/compiler.ts`
- Create: `app/src/engine/compiler.test.ts`
- Modify: `app/package.json` (add `comlink`)

This is the most complex module. It wraps the emception worker bundle (already living in `app/public/emception/` after Task 3) with Comlink, installs the polyfill at init, and exposes `compile()` with memoization.

- [ ] **Step 1: Add `comlink` dep**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm add comlink@^4.4.1
```

Comlink lives in our own deps now (instead of being downloaded into `app/public/emception/comlink.mjs` like in the spike). The download script can still grab it for spike reference, but our compiler imports the npm package.

- [ ] **Step 2: Create `app/src/engine/compiler.ts`**

The compiler's responsibility:
1. Lazy-init: on first `compile()`, spawn the emception Worker, Comlink-wrap it, call `init()`, install the polyfill.
2. `compile(source, opts)`: hash key. If in IDB cache, return. Otherwise call `em++` in the worker, read back `main.wasm`, cache, return.
3. Surface compilation errors structurally (returncode + stderr).

```ts
import * as Comlink from 'comlink'
import { hashSource, getCached, putCached } from './cache'
import { BITS_STDCPP_POLYFILL } from './bits-stdcpp-polyfill'

export type Optimization = 'O0' | 'O2'

export interface CompileOpts {
  optimization: Optimization
}

export interface ClangDiagnostic {
  severity: 'error' | 'warning' | 'note'
  message: string
  line?: number
  column?: number
}

export type CompileResult =
  | { ok: true;  wasm: Uint8Array; warnings: string[]; cacheHit: boolean; ms: number }
  | { ok: false; diagnostics: ClangDiagnostic[]; stderr: string;  ms: number }

export interface Compiler {
  init(): Promise<void>
  compile(source: string, opts: CompileOpts): Promise<CompileResult>
  dispose(): void
}

// --- emception worker proxy shape ------------------------------------------------

interface EmceptionFs {
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  mkdirTree(path: string): Promise<void>
}

interface EmceptionWorker {
  init(): Promise<void>
  run(cmd: string): Promise<{ returncode: number; stdout: string; stderr: string }>
  fileSystem: EmceptionFs
}

// --- impl -----------------------------------------------------------------------

const POLYFILL_DIR = '/working/bits'
const POLYFILL_PATH = '/working/bits/stdc++.h'
const SOURCE_PATH = '/working/main.cpp'
const OUTPUT_PATH = '/working/main.wasm'

let workerSingleton: { worker: Worker; proxy: Comlink.Remote<EmceptionWorker> } | null = null
let initPromise: Promise<void> | null = null

async function ensureWorker(): Promise<Comlink.Remote<EmceptionWorker>> {
  if (workerSingleton) return workerSingleton.proxy
  const workerUrl = `${import.meta.env.BASE_URL}emception/emception.worker.bundle.worker.js`
  const worker = new Worker(workerUrl)
  const proxy = Comlink.wrap<EmceptionWorker>(worker)
  workerSingleton = { worker, proxy }
  return proxy
}

async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const proxy = await ensureWorker()
    await proxy.init()
    // Install the bits/stdc++.h polyfill once
    await proxy.fileSystem.mkdirTree(POLYFILL_DIR)
    await proxy.fileSystem.writeFile(POLYFILL_PATH, BITS_STDCPP_POLYFILL)
  })()
  return initPromise
}

function buildEmCommand(opt: Optimization): string {
  // Mirror of the Phase 0 spike's compile flags. `-I/working` makes our polyfill
  // header reachable via `#include <bits/stdc++.h>`.
  return [
    'em++',
    `-${opt}`,
    '-std=c++17',
    '-I/working',
    '-sSTANDALONE_WASM=1',
    SOURCE_PATH,
    '-o',
    OUTPUT_PATH,
  ].join(' ')
}

function parseDiagnostics(stderr: string): ClangDiagnostic[] {
  const out: ClangDiagnostic[] = []
  // Match patterns like:  main.cpp:36:16: warning: ...
  // Multi-line continuations are kept on the previous diagnostic's message.
  const lineRe = /^(?:main\.cpp|\/working\/main\.cpp):(\d+):(\d+):\s*(error|warning|note):\s*(.*)$/gm
  for (const m of stderr.matchAll(lineRe)) {
    out.push({
      severity: m[3] as 'error' | 'warning' | 'note',
      message: m[4],
      line: Number(m[1]),
      column: Number(m[2]),
    })
  }
  return out
}

export const defaultCompiler: Compiler = {
  async init() {
    await ensureInit()
  },

  async compile(source, opts) {
    const t0 = performance.now()
    const key = await hashSource(source, opts.optimization)

    const hit = await getCached(key)
    if (hit) {
      return {
        ok: true,
        wasm: hit,
        warnings: [],
        cacheHit: true,
        ms: performance.now() - t0,
      }
    }

    const proxy = await ensureWorker()
    await ensureInit()

    await proxy.fileSystem.writeFile(SOURCE_PATH, source)
    const result = await proxy.run(buildEmCommand(opts.optimization))
    if (result.returncode !== 0) {
      return {
        ok: false,
        diagnostics: parseDiagnostics(result.stderr),
        stderr: result.stderr,
        ms: performance.now() - t0,
      }
    }
    const wasm = await proxy.fileSystem.readFile(OUTPUT_PATH)
    await putCached(key, wasm)

    const warnings = parseDiagnostics(result.stderr)
      .filter((d) => d.severity === 'warning')
      .map((d) => d.message)

    return { ok: true, wasm, warnings, cacheHit: false, ms: performance.now() - t0 }
  },

  dispose() {
    if (!workerSingleton) return
    workerSingleton.worker.terminate()
    workerSingleton = null
    initPromise = null
  },
}
```

- [ ] **Step 3: Create `app/src/engine/compiler.test.ts`**

In jsdom we cannot spawn a real Worker pointing at a 60-MB emception bundle. So tests focus on the pure logic:
- `parseDiagnostics` regex correctness
- `buildEmCommand` flag construction (this requires exporting these — adjust compiler.ts to also export them as `export` if needed).

Update `app/src/engine/compiler.ts` to export `parseDiagnostics` and `buildEmCommand` as named exports (add `export` keyword).

```ts
import { describe, it, expect } from 'vitest'
import { parseDiagnostics, buildEmCommand } from './compiler'

describe('buildEmCommand', () => {
  it('uses -O0 when requested', () => {
    expect(buildEmCommand('O0')).toContain('-O0')
    expect(buildEmCommand('O0')).not.toContain('-O2')
  })

  it('uses -O2 when requested', () => {
    expect(buildEmCommand('O2')).toContain('-O2')
  })

  it('always sets STANDALONE_WASM and points at /working', () => {
    const cmd = buildEmCommand('O0')
    expect(cmd).toContain('-sSTANDALONE_WASM=1')
    expect(cmd).toContain('-I/working')
    expect(cmd).toContain('/working/main.cpp')
    expect(cmd).toContain('/working/main.wasm')
  })
})

describe('parseDiagnostics', () => {
  it('extracts errors with line+col', () => {
    const stderr = `main.cpp:10:5: error: 'foo' was not declared in this scope
    foo();
    ^`
    const diags = parseDiagnostics(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      severity: 'error',
      line: 10,
      column: 5,
      message: "'foo' was not declared in this scope",
    })
  })

  it('extracts multiple warnings', () => {
    const stderr = `main.cpp:1:1: warning: a
main.cpp:2:1: warning: b
main.cpp:3:1: note: c`
    const diags = parseDiagnostics(stderr)
    expect(diags).toHaveLength(3)
    expect(diags.map((d) => d.severity)).toEqual(['warning', 'warning', 'note'])
  })

  it('returns empty array for clean compile output', () => {
    expect(parseDiagnostics('shared:INFO: (Emscripten: Running sanity checks)')).toEqual([])
  })
})
```

- [ ] **Step 4: Run tests, expect 6 new pass (43 total)**

```powershell
cd d:\GitHub\GPE-Practice\app
pnpm test
```

- [ ] **Step 5: Commit**

```bash
cd d:\GitHub\GPE-Practice
git add app/package.json app/pnpm-lock.yaml app/src/engine/compiler.ts app/src/engine/compiler.test.ts
git commit -m "feat(engine): Comlink-wrapped emception compiler with polyfill + memoization"
```

---

## Task 8: Engine barrel + final verify + tag

**Files:**
- Create: `app/src/engine/index.ts`

- [ ] **Step 1: Create `app/src/engine/index.ts`**

```ts
export { judge, normalizeWhitespace, compareFloatTokens } from './judge'
export type { Verdict, JudgeInput } from './judge'

export { defaultRuntime } from './runtime'
export type { Runtime, RunOutcome } from './runtime'

export { defaultCompiler } from './compiler'
export type { Compiler, CompileOpts, CompileResult, Optimization, ClangDiagnostic } from './compiler'

export { hashSource } from './cache'
export { registerCoiServiceWorker } from './registerCoi'
```

- [ ] **Step 2: Run full clean pipeline**

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

All must pass.

NOTE: `pnpm build` will include the engine modules in the output bundle, which will grow the bundle from ~220 KB to maybe ~270 KB (Comlink + idb add ~30 KB combined). This is fine.

- [ ] **Step 3: Confirm clean git status**

```powershell
cd d:\GitHub\GPE-Practice
git status
```

Expected: clean. `app/public/emception/` is gitignored.

- [ ] **Step 4: Tag**

```bash
cd d:\GitHub\GPE-Practice
git add app/src/engine/index.ts
git commit -m "feat(engine): barrel export for the engine module"
git tag phase-3-wasm-engine-complete
git log --oneline -20
```

---

## Definition of Done for Phase 3

- [ ] `app/src/engine/judge.ts` — pure judge functions for exact / whitespace / float modes; 14 tests covering happy and edge cases.
- [ ] `app/src/engine/cache.ts` — SHA-256 keyed IndexedDB cache with LRU eviction at 100 entries; tested with fake-indexeddb.
- [ ] `app/src/engine/runtime.ts` + `wasiShim.ts` — WASI-shimmed wasm runner with TLE detection; ported from the Phase 0 spike.
- [ ] `app/src/engine/compiler.ts` — Comlink-wrapped emception worker; installs the `<bits/stdc++.h>` polyfill at init; runs `em++` with `-O0` or `-O2`; memoizes results; surfaces structured diagnostics.
- [ ] `app/src/engine/registerCoi.ts` — registers the `coi-serviceworker` for COOP/COEP on GitHub Pages.
- [ ] `tools/download-emception.ts` — reproducible maintainer-runnable script to populate `app/public/emception/` (gitignored).
- [ ] `app/public/coi-serviceworker.js` vendored from upstream.
- [ ] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build` all clean from a fresh checkout.
- [ ] Tag `phase-3-wasm-engine-complete` exists.

After all above, Phase 4 (IDE shell) can begin — that's where Monaco lands, the Practice / Exam Mode tabs go in, and the engine is hooked to UI buttons. Phase 4 will also add Playwright tests that exercise the full compile → run → judge loop in a real browser.

---

## What to do if you're stuck

- **`fake-indexeddb/auto` import in test-setup doesn't expose `indexedDB`**: ensure the package version is 6.x; the auto entry point changed across versions.
- **`crypto.subtle.digest` is undefined in jsdom**: Vitest 2.x uses Node 20+ which has WebCrypto globally. If you see this, check Node version (`node -v`).
- **Spike MANIFEST.md regex doesn't find the .a hashes**: open the file, copy the actual hash list format, adjust `readSpikeManifest()`. Don't hard-code; the list is the source of truth.
- **`new Worker(workerUrl)` fails at runtime with "no SharedArrayBuffer"**: this means the COI service worker hasn't registered yet — first-ever page load needs a reload. The `coi-serviceworker` does this automatically; if it's not working, check that `app/public/coi-serviceworker.js` is being served at `/coi-serviceworker.js`.
- **Bundle size growth is alarming**: that's expected after adding Comlink + idb. Tree-shake-friendly imports keep it under control. Verify with `pnpm build` and inspecting `dist/assets/*.js`.
- **Vitest can't compile the compiler.ts file because of the `import.meta.env.BASE_URL` reference**: this is Vite's own meta property; in tests Vite-config bridge provides a stub. If it errors, replace with a safer `typeof window === 'undefined' ? '/' : import.meta.env.BASE_URL`.
