# binji/wasm-clang Evaluation Harness

## Cross-Origin Worker Issue and Self-Hosting Fix

Modern browsers (Chrome 86+, Edge) reject `new Worker(crossOriginURL)` even
when the target script is served with `Access-Control-Allow-Origin: *`. This
is a hard requirement of the Worker spec: classic workers (using
`importScripts`) must be same-origin. The `type: 'module'` variant with
`Cross-Origin-Embedder-Policy: require-corp` is the only cross-origin escape
hatch, and binji's worker is a classic importScripts-based worker.

The original `driver.js` constructed the worker as:

```js
new Worker('https://binji.github.io/wasm-clang/worker.js')
```

This produced:

```
Failed to construct 'Worker': Script at 'https://binji.github.io/wasm-clang/worker.js'
cannot be accessed from origin 'http://localhost:5173'.
```

### Fix: self-host the artifacts

All binji artifacts are downloaded into `.cache/` (a gitignored sibling
directory) and the worker is constructed from the same-origin relative path
`./.cache/worker.js`.

`worker.js` was inspected and uses only relative `fetch()` calls (bare names
like `'clang'`, `'lld'`, `'memfs'`, `'sysroot.tar'`). These resolve against
the worker script's own URL, so with the worker at `./.cache/worker.js` they
correctly find sibling files in `.cache/`. No patching of downloaded files
was required.

## Setup: Download Artifacts

Run these commands once from the repository root to populate `.cache/`:

```sh
mkdir -p spike/wasm-toolchain/binji/.cache

curl -o spike/wasm-toolchain/binji/.cache/worker.js   https://binji.github.io/wasm-clang/worker.js
curl -o spike/wasm-toolchain/binji/.cache/shared.js   https://binji.github.io/wasm-clang/shared.js
curl -o spike/wasm-toolchain/binji/.cache/clang       https://binji.github.io/wasm-clang/clang
curl -o spike/wasm-toolchain/binji/.cache/lld         https://binji.github.io/wasm-clang/lld
curl -o spike/wasm-toolchain/binji/.cache/memfs       https://binji.github.io/wasm-clang/memfs
curl -o spike/wasm-toolchain/binji/.cache/sysroot.tar https://binji.github.io/wasm-clang/sysroot.tar
```

Expected file sizes (as of Dec 2023, verified May 2026):

| File         | Size     | Notes                                  |
|--------------|----------|----------------------------------------|
| `clang`      | ~29.8 MB | WASM+WASI clang compiler               |
| `lld`        | ~18.6 MB | WASM+WASI lld linker                   |
| `sysroot.tar` | ~8.9 MB | C++ headers + libc++-wasm runtime libs |
| `memfs`      | ~337 KB  | In-memory WASI filesystem WASM module  |
| `shared.js`  | ~23 KB   | Binji API class (loaded by worker)     |
| `worker.js`  | ~3 KB    | Worker entry script                    |

Note: the filenames `clang`, `lld`, and `memfs` have **no file extension** —
that is how binji's `shared.js` requests them by default.

## Why .cache/ Is Gitignored

`.cache/` is matched by the `spike/**/.cache/` pattern in the root
`.gitignore`. The binary artifacts (~58 MB total) must not be committed.
Engineers re-run the download commands above as needed on a fresh checkout.

## Running the Harness

1. Populate `.cache/` as above (one-time per checkout).
2. Serve the toolchain directory from a static file server:
   ```sh
   npx serve spike/wasm-toolchain
   # or: python -m http.server 3000  (from inside spike/wasm-toolchain)
   ```
3. Open `http://localhost:3000/binji/` in Chrome or Edge.
4. Wait for "就緒" — artifacts load from `.cache/` (no external network
   requests needed after initial download).
5. Click "冷編譯" for a cold compile run, then "暖編譯" for warm.
6. Record `coldCompileMs` and `warmCompileMs` into `../results.json`.
