# Phase 0 — Spikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the two architectural assumptions that gate the rest of the design — (1) an in-browser WASM C++ toolchain can compile a representative GPE problem within the latency/payload budget, and (2) GitHub Device Flow can complete from a static site without a CORS-proxy backend.

**Architecture:** Stand up a tiny throwaway `spike/` directory with two independent HTML demos. No production code is touched. Each spike emits a written findings document in `docs/spikes/`. Outcomes feed the architecture decisions baked into the remaining phases.

**Tech Stack:** Plain HTML/CSS/JS (no build step). Three candidate WASM toolchains evaluated in parallel: `wasm-clang` (jprendes/emception), `clangd-wasm`, and `JSCPP` (as a fallback interpreter). One throwaway GitHub App for the Device Flow test.

**Hard pass/fail criteria for the WASM spike:**
- Cold first-load: cached payload ≤ **40 MB**
- Compile a 30-line `<bits/stdc++.h>`-using sample: cold ≤ **6 s**, warm ≤ **1 s** on a 2020-era laptop
- Run a sample binary against stdin → stdout: works, timeout enforceable
- License: MIT / Apache 2.0 / BSD / similar permissive

**Hard pass/fail criteria for the Device Flow spike:**
- Device code request from a `file://` (or `localhost`) static page succeeds
- Access-token polling from the same page receives a token (or returns a clear CORS error)

**Halt condition:** If all three WASM candidates fail, stop and re-open §11 risk 1 (decide on hosted Judge0 vs different approach). Do not proceed to Phase 1.

---

## Files Created/Modified

- Create: `spike/wasm-toolchain/index.html` — driver page for the WASM spike
- Create: `spike/wasm-toolchain/sample.cpp` — the test program
- Create: `spike/wasm-toolchain/cases/sample-01.in` / `.out` — test fixture
- Create: `spike/wasm-toolchain/results.json` — machine-readable results
- Create: `spike/device-flow/index.html` — driver page for the Device Flow spike
- Create: `docs/spikes/2026-05-18-wasm-toolchain-findings.md`
- Create: `docs/spikes/2026-05-18-device-flow-findings.md`
- Modify: `.gitignore` — add `spike/wasm-toolchain/node_modules/` if any toolchain ships as npm

---

## Task 1: Set up the spike directory and sample program

**Files:**
- Create: `spike/wasm-toolchain/sample.cpp`
- Create: `spike/wasm-toolchain/cases/sample-01.in`
- Create: `spike/wasm-toolchain/cases/sample-01.out`
- Create: `spike/wasm-toolchain/README.md`

- [ ] **Step 1: Create `spike/wasm-toolchain/sample.cpp` — a representative GPE-style program**

This program exercises `<bits/stdc++.h>`, STL containers, common algorithms, and 64-bit arithmetic — the union of what most GPE problems need.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    sort(a.begin(), a.end());

    long long sum = 0;
    map<long long, int> freq;
    for (auto x : a) {
        sum += x;
        freq[x]++;
    }

    long long mode = a[0];
    int best = 0;
    for (auto& [k, v] : freq) {
        if (v > best) { best = v; mode = k; }
    }

    cout << sum << "\n" << mode << "\n";
    return 0;
}
```

- [ ] **Step 2: Create the test fixture**

Create `spike/wasm-toolchain/cases/sample-01.in`:

```
5
3 1 4 1 5
```

Create `spike/wasm-toolchain/cases/sample-01.out`:

```
14
1
```

- [ ] **Step 3: Verify the sample compiles & produces the expected output with native g++**

Run (PowerShell, assuming MinGW or WSL g++):

```powershell
g++ -O2 -std=c++17 spike/wasm-toolchain/sample.cpp -o /tmp/sample.exe
Get-Content spike/wasm-toolchain/cases/sample-01.in | /tmp/sample.exe
```

Expected stdout:
```
14
1
```

If the output doesn't match, the test fixture is wrong — fix `sample-01.out` to match what `g++` produces, since reference behavior on the native compiler is the canonical answer.

- [ ] **Step 4: Create `spike/wasm-toolchain/README.md` documenting the spike's purpose and pass/fail criteria**

```markdown
# WASM Toolchain Spike

**Goal:** Pick a WASM C++ toolchain that can compile and run `sample.cpp`
within the budget defined in `docs/superpowers/specs/2026-05-18-gpe-practice-rebuild-design.md` §11.1.

**Candidates evaluated:** wasm-clang (emception), clangd-wasm, JSCPP (fallback).

**Hard criteria:**
- Cold compile ≤ 6 s
- Warm compile ≤ 1 s
- Cached payload ≤ 40 MB
- Supports `<bits/stdc++.h>` + C++17 STL
- Permissive license (MIT / Apache 2.0 / BSD)

**Test corpus:** `sample.cpp` + `cases/sample-01.in/.out`.

**Outcome:** Findings written to `docs/spikes/2026-05-18-wasm-toolchain-findings.md`.
```

- [ ] **Step 5: Commit**

```bash
git add spike/wasm-toolchain/sample.cpp spike/wasm-toolchain/cases/ spike/wasm-toolchain/README.md
git commit -m "spike: add sample.cpp test corpus for WASM toolchain evaluation"
```

---

## Task 2: Evaluate candidate 1 — wasm-clang (emception)

**Background:** [`jprendes/emception`](https://github.com/jprendes/emception) ships clang + lld + libc++ in WASM. Mature, has demos.

**Files:**
- Create: `spike/wasm-toolchain/emception/index.html`
- Create: `spike/wasm-toolchain/emception/driver.js`
- Modify: `spike/wasm-toolchain/results.json` (created on first write)

- [ ] **Step 1: Read the emception README**

Open `https://github.com/jprendes/emception/blob/main/README.md` in the browser. Note:
- How is the toolchain loaded? (CDN URL, npm package, or self-host?)
- What's the API surface for compile + run?
- What's the total payload size?

Record findings in a scratch note — they'll feed Step 3.

- [ ] **Step 2: Create `spike/wasm-toolchain/emception/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>WASM Spike — emception</title>
</head>
<body>
  <h1>emception WASM C++ Spike</h1>
  <pre id="status">Loading…</pre>
  <button id="run-cold">Run cold compile</button>
  <button id="run-warm" disabled>Run warm compile</button>
  <pre id="log"></pre>
  <script type="module" src="./driver.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `spike/wasm-toolchain/emception/driver.js`**

(The exact import URL and API depends on what Step 1 found — adjust the import and calls to match emception's actual API. Skeleton:)

```js
import { Emception } from 'https://cdn.example/emception';  // replace with the URL/spec from Step 1

const $status = document.getElementById('status');
const $log = document.getElementById('log');
const $cold = document.getElementById('run-cold');
const $warm = document.getElementById('run-warm');

const log = (msg) => { $log.textContent += msg + '\n'; };

async function loadSample() {
  const src = await (await fetch('../sample.cpp')).text();
  const stdin = await (await fetch('../cases/sample-01.in')).text();
  const expected = await (await fetch('../cases/sample-01.out')).text();
  return { src, stdin, expected };
}

async function measureCompile(emception, src, label) {
  const t0 = performance.now();
  const out = await emception.compile(src, { args: ['-O2', '-std=c++17'] });  // adjust to real API
  const ms = performance.now() - t0;
  log(`${label} compile: ${ms.toFixed(0)} ms, wasm bytes: ${out.wasm.byteLength}`);
  return { ms, wasm: out.wasm };
}

async function measureRun(emception, wasm, stdin) {
  const t0 = performance.now();
  const result = await emception.run(wasm, { stdin });  // adjust to real API
  const ms = performance.now() - t0;
  log(`run: ${ms.toFixed(0)} ms, stdout:\n${result.stdout}`);
  return { ms, stdout: result.stdout };
}

let emception, sample;

(async () => {
  $status.textContent = 'Initializing emception (this measures cold load + sysroot)…';
  const t0 = performance.now();
  emception = new Emception();
  await emception.init();
  const initMs = performance.now() - t0;
  sample = await loadSample();
  $status.textContent = `Ready. emception init took ${initMs.toFixed(0)} ms.`;
  log(`init ${initMs.toFixed(0)} ms`);
  $cold.disabled = false;
})().catch((e) => { $status.textContent = 'FAILED: ' + e.message; });

$cold.onclick = async () => {
  $cold.disabled = true;
  const { ms, wasm } = await measureCompile(emception, sample.src, 'cold');
  const run = await measureRun(emception, wasm, sample.stdin);
  const ok = run.stdout.trim() === sample.expected.trim();
  log(`OUTPUT MATCH: ${ok}`);
  $warm.disabled = false;
};

$warm.onclick = async () => {
  await measureCompile(emception, sample.src, 'warm');
};
```

- [ ] **Step 4: Serve the spike directory and open the emception page**

```powershell
npx --yes serve spike/wasm-toolchain -l 5173
```

Open `http://localhost:5173/emception/` in a hard-refreshed browser (Ctrl+Shift+R or DevTools → Network → "Disable cache" enabled).

- [ ] **Step 5: Measure cold load + cold compile + warm compile + run correctness**

In the browser:
1. Open DevTools → Network tab. Tick "Disable cache". Reload.
2. Wait for `Ready. emception init took NNN ms.`
3. Record the **transferred bytes** from DevTools' Network summary at the bottom.
4. Click "Run cold compile". Record `cold compile: ... ms` and `OUTPUT MATCH: true/false`.
5. Click "Run warm compile". Record `warm compile: ... ms`.

- [ ] **Step 6: Append the measurements to `spike/wasm-toolchain/results.json`**

If the file doesn't exist yet, create it as `{ "candidates": [] }`. Then add an entry:

```json
{
  "candidates": [
    {
      "name": "emception",
      "url": "https://github.com/jprendes/emception",
      "license": "MIT",
      "initMs": 0,
      "coldCompileMs": 0,
      "warmCompileMs": 0,
      "runMs": 0,
      "transferredBytes": 0,
      "outputMatch": false,
      "supportsBitsStdcpp": false,
      "notes": ""
    }
  ]
}
```

Replace the zeros with the actual measurements.

- [ ] **Step 7: Verify against pass criteria**

Check each:
- `transferredBytes` ≤ 41,943,040 (40 MB)
- `coldCompileMs` ≤ 6000
- `warmCompileMs` ≤ 1000
- `outputMatch` === true
- `supportsBitsStdcpp` === true (confirmed by the fact that `sample.cpp` compiles)
- License is MIT / Apache / BSD

Set the `notes` field to "PASS" or "FAIL: <reason>".

- [ ] **Step 8: Commit**

```bash
git add spike/wasm-toolchain/emception/ spike/wasm-toolchain/results.json
git commit -m "spike(wasm): evaluate emception toolchain"
```

---

## Task 3: Evaluate candidate 2 — clangd-wasm

**Background:** [`guyutongxue/clangd-in-browser`](https://github.com/guyutongxue/clangd-in-browser) or similar. Smaller payload (no full libc), language-server-focused.

**Files:**
- Create: `spike/wasm-toolchain/clangd/index.html`
- Create: `spike/wasm-toolchain/clangd/driver.js`
- Modify: `spike/wasm-toolchain/results.json`

- [ ] **Step 1: Find the current best clangd-wasm distribution**

Search GitHub for "clangd wasm" repos updated in the last year. The maintained options at time of writing are typically clangd in WASM as part of `monaco-clangd` integrations. Note the package and import URL.

If no actively-maintained option supports actual **compile + run** (most clangd-wasm packages do language-server features only, not codegen), record this finding and mark the candidate as **N/A — language server only**, then skip to Task 4.

- [ ] **Step 2 (only if Step 1 found a compiler-capable distro): Create `clangd/index.html` and `driver.js` mirroring Task 2's structure**

Same skeleton, different import URL and API adapter.

- [ ] **Step 3 (only if Step 2 happened): Repeat measurements (cold load, cold compile, warm compile, run)**

Same procedure as Task 2 Step 5.

- [ ] **Step 4: Append result to `results.json` (whether N/A or measured)**

```json
{
  "name": "clangd-wasm",
  "url": "<distro url>",
  "license": "<spdx>",
  "notes": "N/A — language server only, no codegen pipeline"
  // OR full measurements if it does compile
}
```

- [ ] **Step 5: Commit**

```bash
git add spike/wasm-toolchain/clangd/ spike/wasm-toolchain/results.json
git commit -m "spike(wasm): evaluate clangd-wasm"
```

---

## Task 4: Evaluate candidate 3 — JSCPP (fallback interpreter)

**Background:** [`JSCPP`](https://github.com/felixhao28/JSCPP) is a JS interpreter for a C++ subset. Tiny payload (~200 KB), no real compile/link step. Doesn't support `<bits/stdc++.h>` or all of STL. Worth evaluating as a fallback for "easy" questions if the real toolchains miss the budget.

**Files:**
- Create: `spike/wasm-toolchain/jscpp/index.html`
- Create: `spike/wasm-toolchain/jscpp/driver.js`
- Modify: `spike/wasm-toolchain/results.json`

- [ ] **Step 1: Install JSCPP**

JSCPP is npm-only. Easiest path: use a CDN like `esm.sh`:

```js
import JSCPP from 'https://esm.sh/jscpp@3';
```

- [ ] **Step 2: Create `jscpp/index.html` mirroring Task 2**

Same buttons, same log pane.

- [ ] **Step 3: Create `jscpp/driver.js`**

```js
import JSCPP from 'https://esm.sh/jscpp@3';

const $status = document.getElementById('status');
const $log = document.getElementById('log');
const $cold = document.getElementById('run-cold');
const log = (msg) => { $log.textContent += msg + '\n'; };

async function loadSample() {
  const src = await (await fetch('../sample.cpp')).text();
  const stdin = await (await fetch('../cases/sample-01.in')).text();
  const expected = await (await fetch('../cases/sample-01.out')).text();
  return { src, stdin, expected };
}

$cold.onclick = async () => {
  const { src, stdin, expected } = await loadSample();
  let stdout = '';
  const t0 = performance.now();
  try {
    JSCPP.run(src, stdin, {
      stdio: { write: (s) => { stdout += s; } }
    });
    const ms = performance.now() - t0;
    log(`run: ${ms.toFixed(0)} ms`);
    log(`stdout:\n${stdout}`);
    log(`OUTPUT MATCH: ${stdout.trim() === expected.trim()}`);
  } catch (e) {
    log('FAILED: ' + e.message);
  }
};

$status.textContent = 'Ready (JSCPP loads lazily on first run)';
$cold.disabled = false;
```

- [ ] **Step 4: Run and measure**

Open `http://localhost:5173/jscpp/`. Click Run. **Most likely failure modes:**
- `<bits/stdc++.h>` not supported → JSCPP throws during parse
- Some STL feature (e.g., `map` iterators with structured bindings) unsupported

Record the actual outcome.

- [ ] **Step 5: Append result to `results.json`**

```json
{
  "name": "jscpp",
  "url": "https://github.com/felixhao28/JSCPP",
  "license": "MIT",
  "runMs": 0,
  "transferredBytes": 0,
  "outputMatch": false,
  "supportsBitsStdcpp": false,
  "notes": "Likely FAIL on <bits/stdc++.h>; fallback candidate only"
}
```

- [ ] **Step 6: Commit**

```bash
git add spike/wasm-toolchain/jscpp/ spike/wasm-toolchain/results.json
git commit -m "spike(wasm): evaluate JSCPP fallback"
```

---

## Task 5: Pick a winner and write findings

**Files:**
- Create: `docs/spikes/2026-05-18-wasm-toolchain-findings.md`

- [ ] **Step 1: Read `spike/wasm-toolchain/results.json`**

Scan all three candidates. For each, classify as PASS / FAIL / N/A based on the hard criteria in the plan header.

- [ ] **Step 2: Write `docs/spikes/2026-05-18-wasm-toolchain-findings.md`**

Use this template:

```markdown
# WASM Toolchain Spike — Findings

**Date:** 2026-05-18
**Spike target:** §11.1 of the design spec
**Conclusion:** [PASS / FAIL]

## Measurements

| Candidate    | Cold compile | Warm compile | Payload  | <bits/stdc++.h> | Output OK | License | Verdict |
|--------------|-------------:|-------------:|---------:|-----------------|-----------|---------|---------|
| emception    |     <N> ms   |     <N> ms   |  <N> MB  | ✔ / ✘           | ✔ / ✘     | MIT     | PASS / FAIL |
| clangd-wasm  |     ...      |     ...      |   ...    | ...             | ...       | ...     | N/A |
| JSCPP        |     ...      |     ...      |   ...    | ✘               | ...       | MIT     | FAIL |

## Picked: `<winner or 'none'>`

[Reasoning. If multiple pass, pick by: (1) smallest payload, (2) MIT/Apache > BSD > other,
 (3) more recent commits.]

## Implications for Phase 3 (WASM engine)

- `engine/compiler.ts` will wrap `<winner>` with the interface defined in spec §8.1.
- WASM blobs in `app/public/wasm/` are the artifacts shipped by `<winner>` (specific filenames listed here once chosen).
- IndexedDB caching: <winner> already caches its sysroot internally / we must layer our own caching / not needed.

## If verdict is FAIL

Halt before Phase 1. Re-open spec §11.1 with the user. Likely architectural responses:
1. Drop the static-only invariant and add a self-hosted Judge0 backend.
2. Restrict v1 question set to those JSCPP can run (drops `<bits/stdc++.h>`, parts of STL).
3. Revisit whether a different toolchain (e.g., Cheerp, WASI-SDK port) is worth a second spike.
```

Fill in the actual numbers from `results.json` and write the picked-winner reasoning.

- [ ] **Step 3: Commit**

```bash
git add docs/spikes/2026-05-18-wasm-toolchain-findings.md
git commit -m "docs(spikes): record WASM toolchain findings"
```

---

## Task 6: Set up the Device Flow spike

**Files:**
- Create: `spike/device-flow/index.html`
- Create: `spike/device-flow/driver.js`
- Create: `spike/device-flow/README.md`

- [ ] **Step 1: Register a throwaway GitHub App (manual maintainer step)**

Visit `https://github.com/settings/apps/new`. Fill in:
- Name: `gpe-practice-spike` (must be unique)
- Homepage URL: `http://localhost`
- Callback URL: leave blank
- Enable **Device Flow**: ✔
- Permissions: Contents (read & write), Pull requests (read & write), Metadata (read)
- Where can this app be installed: Only on this account
- **Uncheck** "Webhook → Active"

After creation, note the **Client ID** (it's public — fine to commit). **Do not** generate a client secret; Device Flow doesn't need one.

- [ ] **Step 2: Create `spike/device-flow/README.md`**

```markdown
# Device Flow Spike

**Goal:** Verify GitHub Device Flow can complete from a static browser page
without a CORS-proxy backend.

**Test app Client ID:** `<paste from Step 1>`

**Outcome:** Findings in `docs/spikes/2026-05-18-device-flow-findings.md`.
```

- [ ] **Step 3: Create `spike/device-flow/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>Device Flow Spike</title>
</head>
<body>
  <h1>GitHub Device Flow CORS Spike</h1>
  <button id="start">Start device flow</button>
  <pre id="log"></pre>
  <script type="module" src="./driver.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `spike/device-flow/driver.js`**

```js
const CLIENT_ID = 'REPLACE_WITH_CLIENT_ID_FROM_STEP_1';
const SCOPE = 'public_repo';

const $log = document.getElementById('log');
const log = (msg) => { $log.textContent += msg + '\n'; };

document.getElementById('start').onclick = async () => {
  log('--- Step A: POST /login/device/code ---');
  let codeResp;
  try {
    codeResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    });
  } catch (e) {
    log('NETWORK FAILED (likely CORS preflight): ' + e.message);
    return;
  }
  if (!codeResp.ok) {
    log(`HTTP ${codeResp.status}: ${await codeResp.text()}`);
    return;
  }
  const code = await codeResp.json();
  log(`device_code:       ${code.device_code.slice(0, 6)}…`);
  log(`user_code:         ${code.user_code}`);
  log(`verification_uri:  ${code.verification_uri}`);
  log(`interval:          ${code.interval}s`);

  log('\n>>> Please open the verification URI in another tab and enter the user code.');
  log('>>> The polling loop will start in 5 seconds.\n');

  await new Promise((r) => setTimeout(r, 5000));

  log('--- Step B: poll POST /login/oauth/access_token ---');
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    let pollResp;
    try {
      pollResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code: code.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
    } catch (e) {
      log('POLL NETWORK FAILED (CORS?): ' + e.message);
      return;
    }
    const body = await pollResp.json();
    if (body.access_token) {
      log(`SUCCESS — token starts with: ${body.access_token.slice(0, 6)}…`);
      log('CORS OK on both endpoints. Device Flow viable from a static site.');
      return;
    }
    if (body.error === 'authorization_pending') {
      log('… still pending');
    } else if (body.error === 'slow_down') {
      log('… slow_down, doubling interval');
      code.interval *= 2;
    } else {
      log(`POLL ERROR: ${body.error} — ${body.error_description || ''}`);
      return;
    }
    await new Promise((r) => setTimeout(r, code.interval * 1000));
  }
  log('TIMED OUT waiting for user authorization');
};
```

- [ ] **Step 5: Replace `REPLACE_WITH_CLIENT_ID_FROM_STEP_1` with the actual Client ID in `driver.js`**

- [ ] **Step 6: Serve and open the spike**

```powershell
npx --yes serve spike/device-flow -l 5174
```

Open `http://localhost:5174/` in a browser.

- [ ] **Step 7: Run the flow end-to-end**

1. Click "Start device flow".
2. Read the displayed `user_code`.
3. Open `https://github.com/login/device` in a separate tab. Enter the user code. Authorize the app for your account.
4. Return to the spike tab and watch the polling loop output.
5. **Record the outcome** — one of:
   - Both endpoints succeeded, token received → PASS.
   - `POST /login/device/code` failed with `TypeError: Failed to fetch` → CORS block on the first call. Hard FAIL.
   - `POST /login/oauth/access_token` failed with `TypeError: Failed to fetch` after device-code succeeded → CORS block on the poll. Partial FAIL; the user-visible step works but we can't claim the token.
   - Any other error → record verbatim.

- [ ] **Step 8: Commit**

```bash
git add spike/device-flow/
git commit -m "spike: add Device Flow CORS evaluation harness"
```

---

## Task 7: Write Device Flow findings

**Files:**
- Create: `docs/spikes/2026-05-18-device-flow-findings.md`

- [ ] **Step 1: Write the findings document**

```markdown
# Device Flow Spike — Findings

**Date:** 2026-05-18
**Spike target:** §11.2 of the design spec
**Conclusion:** [PASS / PARTIAL / FAIL]

## Test setup

- Throwaway GitHub App Client ID: `<id>` (no secret — Device Flow only)
- Spike page served at `http://localhost:5174/`
- Scope requested: `public_repo`

## Result

- `POST /login/device/code` from browser: [✔ / ✘ — error verbatim if ✘]
- User authorization at `github.com/login/device`: [✔ / ✘]
- `POST /login/oauth/access_token` from browser: [✔ / ✘ — error verbatim if ✘]
- Access token received: [✔ / ✘]

## Implications for Phase 5 (contribute flow)

- **If PASS:** `contrib/octokitClient.ts` uses `@octokit/auth-oauth-device` as the primary
  auth path. PAT fallback is shown only behind a "進階" / "Advanced" disclosure.
- **If PARTIAL or FAIL:** PAT becomes the primary path. The "連結 GitHub" button is
  re-labelled "貼上 PAT" with linked instructions for generating a fine-grained PAT
  scoped to the repo. Device Flow code is dropped from the design (no proxy).

## Notes

[Any quirks observed — e.g., `slow_down` errors, redirect behavior, browser variation.]
```

Fill in the actual outcome.

- [ ] **Step 2: Commit**

```bash
git add docs/spikes/2026-05-18-device-flow-findings.md
git commit -m "docs(spikes): record Device Flow CORS findings"
```

---

## Task 8: Update `.gitignore` and tag the spike state

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append to `.gitignore`**

```
# Spike artifacts that shouldn't ship with the main app
spike/**/node_modules/
spike/**/.cache/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore spike build artifacts"
```

- [ ] **Step 3: Tag the spike completion**

```bash
git tag spike-phase-0-complete
```

This makes it easy to return to a known-good post-spike state if a later phase wants to re-evaluate.

---

## Definition of Done for Phase 0

- [ ] `docs/spikes/2026-05-18-wasm-toolchain-findings.md` exists, names a picked toolchain (or says "none — halt"), and is committed.
- [ ] `docs/spikes/2026-05-18-device-flow-findings.md` exists, names the auth-primary-path decision, and is committed.
- [ ] `spike/wasm-toolchain/results.json` contains measured numbers for all three candidates (or "N/A" for ones that don't apply).
- [ ] The spike runs reproducibly: another engineer can `cd spike/wasm-toolchain && npx serve` and replay the same measurements.
- [ ] Git tag `spike-phase-0-complete` exists.

After all the above are checked, Phase 1 (scaffolding) can begin. The Phase 1 plan will reference the picked toolchain by name.

---

## What to do if you're stuck

- **Browser shows CORS error on a fetch:** That's likely the spike's discovery, not a bug — record it as a finding and continue.
- **emception (or any candidate) refuses to load:** Check the candidate's GitHub Issues for the last 60 days. If broken upstream, mark N/A and move on; don't try to fix it.
- **`sample.cpp` doesn't compile natively:** Fix `sample.cpp` first. The spike isn't meaningful if the reference behavior is wrong.
- **Network during spike is slow:** Re-measure cold compile only after the Chrome cache is verified disabled. Network-bound numbers are misleading; the criterion is "transferred bytes ≤ 40 MB", not wall-clock seconds.
