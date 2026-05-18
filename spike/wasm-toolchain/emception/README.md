# emception Evaluation Harness

The driver at `driver.js` exercises emception's compile + run pipeline against
`../sample.cpp` and reports cold/warm timings + OUTPUT MATCH.

## Background: Why We Pivoted

The original approach was to build emception locally via Docker
(`./build-with-docker.sh` in the cloned repo). The build OOMed twice — once
at approximately 83% of the LLVM link step and again at approximately 92%.
The LLVM link stage for WASM targets is extremely memory-hungry.

We pivoted to using the pre-built artifacts from the live demo at
`https://jprendes.github.io/emception/`. The demo is a webpack-bundled
deployment (built 2023-02-16) whose static files are served with
`Access-Control-Allow-Origin: *`.

## Setup: Download Artifacts

The `.cache/` directory is `.gitignored`. Engineers must download artifacts
before running the harness. See `MANIFEST.md` for the full file inventory
and download commands.

**Quick download (from repo root):**

```bash
# Bash / Git Bash
BASE="https://jprendes.github.io/emception"
CACHE="spike/wasm-toolchain/emception/.cache"
mkdir -p "$CACHE"

curl --parallel --parallel-immediate \
  -o "$CACHE/main.bundle.js"                    "$BASE/main.bundle.js" \
  -o "$CACHE/emception.worker.bundle.worker.js" "$BASE/emception.worker.bundle.worker.js" \
  -o "$CACHE/cecdfcda360457a8f204.br"           "$BASE/cecdfcda360457a8f204.br" \
  -o "$CACHE/f0283badd42fe745cbe4.wasm"         "$BASE/f0283badd42fe745cbe4.wasm" \
  -o "$CACHE/9d1e542b80004e27297f.wasm"         "$BASE/9d1e542b80004e27297f.wasm"

curl -L -o "$CACHE/comlink.mjs" \
  "https://unpkg.com/comlink@4.4.1/dist/esm/comlink.mjs"
```

Then run the full sysroot library download from `MANIFEST.md`.

**Total download: ~57.6 MB** (23.5 MB for the root toolchain pack + 30.8 MB
sysroot + 3.6 MB bundles + 1 MB tools).

## Running the Harness

Emception requires `SharedArrayBuffer`, which requires COOP/COEP headers.

```powershell
node spike\wasm-toolchain\serve-coop-coep.mjs
```

Then open `http://localhost:5173/emception/` in Chrome/Edge with DevTools >
Network > "Disable cache" ticked (important on first run).

## What to Measure

1. **initMs**: Time until "就緒" (Ready) appears — includes loading and
   decompressing `root.pack.br` (~23.5 MB) into the virtual FS. The first run
   is slowest; emception caches in IndexedDB for subsequent runs.
2. **transferredBytes**: DevTools Network total at the bottom after init.
3. Click "冷編譯 (Cold compile)" — log entries `coldCompileMs` and `runMs`,
   and `OUTPUT MATCH: true|false`. The first compile also lazily XHR-fetches
   whatever sysroot `.a` files the linker needs from `.cache/`.
4. Click "暖編譯 (Warm compile)" — log entry `warmCompileMs`.

Paste back: `initMs`, `transferredBytes`, `coldCompileMs`, `runMs`,
`warmCompileMs`, `OUTPUT MATCH`.

## Pass Criteria (from spec §11.1)

- Cold compile (excluding init): <= 6,000 ms
- Warm compile: <= 1,000 ms
- `<bits/stdc++.h>` works (directly or via trivial polyfill)
- License permissive (MIT)

## Architecture Notes

- `driver.js` imports Comlink from `.cache/comlink.mjs` and spins up
  `.cache/emception.worker.bundle.worker.js` as a Web Worker.
- The worker bundle derives its webpack public path from `self.location.href`,
  so placing it in `.cache/` causes it to auto-fetch all hashed `.a` files
  from `.cache/hash.a` (same-origin, COEP-safe).
- The root toolchain pack (`cecdfcda360457a8f204.br`) contains llvm-box.wasm,
  binaryen-box.wasm, python.wasm, quicknode.wasm, and wasm-package.wasm.
  It is fetched and unpacked during `emception.init()`.
- The `index.html` is unchanged; the only new file is `MANIFEST.md`.

## Troubleshooting

- **"SharedArrayBuffer is not defined"**: the COOP/COEP headers are missing.
  Confirm you started the server with `serve-coop-coep.mjs`, not `npx serve`.
- **"BLOCKED: 無法載入 Comlink"**: `.cache/comlink.mjs` is missing. Re-run
  the download step.
- **"BLOCKED: 無法建立 Worker"**: `.cache/emception.worker.bundle.worker.js`
  is missing.
- **em++ fails with "undefined symbol"**: a required `.a` variant was not
  downloaded. Check the error message and add the missing hash file from
  `MANIFEST.md` (or download the full 249-file set if unsure).
- **init() hangs or errors**: the root pack `cecdfcda360457a8f204.br` may be
  corrupted. Delete it and re-download.
