/**
 * binji/wasm-clang evaluation driver
 *
 * Approach: Option A (programmatic API via self-hosted worker)
 *
 * CROSS-ORIGIN WORKER FIX:
 *   Modern browsers (Chrome 86+, Edge) block `new Worker(crossOriginURL)` even
 *   when the target script is served with `Access-Control-Allow-Origin: *`.
 *   The Worker spec requires same-origin script URLs by default (the
 *   `type: 'module'` variant with COEP is the only cross-origin escape hatch,
 *   and binji's worker is a classic importScripts-based worker, not a module).
 *
 *   Fix: all binji artifacts are self-hosted under ./.cache/ so the Worker
 *   constructor sees a same-origin URL.
 *
 *   Artifacts are self-hosted in ./.cache/ to avoid cross-origin Worker
 *   restrictions. Run the following commands once to populate the cache:
 *
 *     mkdir spike/wasm-toolchain/binji/.cache
 *     curl -o spike/wasm-toolchain/binji/.cache/worker.js   https://binji.github.io/wasm-clang/worker.js
 *     curl -o spike/wasm-toolchain/binji/.cache/shared.js   https://binji.github.io/wasm-clang/shared.js
 *     curl -o spike/wasm-toolchain/binji/.cache/clang       https://binji.github.io/wasm-clang/clang
 *     curl -o spike/wasm-toolchain/binji/.cache/lld         https://binji.github.io/wasm-clang/lld
 *     curl -o spike/wasm-toolchain/binji/.cache/memfs       https://binji.github.io/wasm-clang/memfs
 *     curl -o spike/wasm-toolchain/binji/.cache/sysroot.tar https://binji.github.io/wasm-clang/sysroot.tar
 *
 *   The .cache/ directory is gitignored on purpose (spike/**\/.cache/ in
 *   .gitignore). Engineers re-run the download commands as needed.
 *
 * WHY THIS APPROACH:
 *   - shared.js exposes a rich `API` class with `compileLinkRun(contents)` —
 *     this is the single call that runs clang → lld → wasm-execute on a source
 *     string. No manual UI interaction required.
 *   - worker.js wraps that API in a Web Worker and accepts
 *     { id: 'compileLinkRun', data: sourceString } postMessage messages.
 *   - worker.js uses only relative fetch() calls (bare filenames like 'clang',
 *     'lld', 'memfs', 'sysroot.tar') which resolve against the worker's own
 *     URL — i.e., ./.cache/ — so sibling files in .cache/ are found correctly.
 *   - worker.js was inspected and contains NO hardcoded absolute URLs; no
 *     patching of the downloaded file was required.
 *
 * ARCHITECTURE:
 *   This driver creates a Web Worker pointing at ./.cache/worker.js
 *   (same-origin). The worker loads shared.js via importScripts('shared.js')
 *   (relative, resolves to ./.cache/shared.js). It then fetches clang, lld,
 *   memfs, and sysroot.tar as bare names (also relative → ./.cache/).
 *
 *   binji's worker.js expects to be initialised with a MessageChannel port:
 *     postMessage({ id: 'constructor', data: port2 }, [port2])
 *   Then compile+link+run:
 *     port1.postMessage({ id: 'compileLinkRun', data: sourceString })
 *   Terminal output comes back as:
 *     { id: 'write', data: string }
 *
 * BITS/STDC++.H CAVEAT:
 *   binji's sysroot uses LLVM libc++ (not libstdc++). The header
 *   <bits/stdc++.h> is a GCC-only convenience umbrella — it does not exist
 *   in libc++. The driver therefore uses `sample-libc++.cpp` (in this
 *   directory) which replaces the single <bits/stdc++.h> include with
 *   explicit libc++ headers that cover the same symbols. This is the
 *   canonical source for the binji run; expected output is identical.
 *
 * PAYLOAD (as of May 2026, self-hosted from binji.github.io):
 *   clang        ~29.8 MB  (clang compiler, WASM+WASI)
 *   lld          ~18.6 MB  (lld linker, WASM+WASI)
 *   sysroot.tar  ~ 8.9 MB  (C++ headers + libc++-wasm runtime libs)
 *   memfs        ~ 337 KB  (in-memory WASI filesystem WASM module)
 *   JS glue      ~  26 KB  (shared.js + worker.js)
 *   Total        ~58 MB on cold init (served locally from .cache/)
 *
 * HOW TO RUN:
 *   1. Populate .cache/ with the curl commands above (one-time).
 *   2. Serve spike/wasm-toolchain/ from any static file server:
 *        npx serve spike/wasm-toolchain    # or: python -m http.server
 *      Then open http://localhost:3000/binji/  (no special headers needed)
 *   3. Wait for "就緒" (ready) — serves clang, lld, sysroot from .cache/.
 *      Record the initMs shown.
 *   4. Click "冷編譯" and wait. Record coldCompileMs + runMs.
 *   5. Click "暖編譯". Record warmCompileMs.
 *   6. Copy the log output into results.json.
 *
 * LICENSE: Apache-2.0 (binji/wasm-clang repo)
 */

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $status = document.getElementById('status');
const $log    = document.getElementById('log');
const $cold   = document.getElementById('run-cold');
const $warm   = document.getElementById('run-warm');

const log = (msg) => { $log.textContent += msg + '\n'; };

// ---------------------------------------------------------------------------
// Source — libc++ compatible rewrite of sample.cpp
// We fetch it from the adjacent file so the human can inspect/edit it.
// ---------------------------------------------------------------------------
async function loadAssets() {
  const [src, stdin, expected] = await Promise.all([
    fetch('./sample-libc++.cpp').then(r => {
      if (!r.ok) throw new Error(`fetch sample-libc++.cpp: ${r.status}`);
      return r.text();
    }),
    fetch('../cases/sample-01.in').then(r => {
      if (!r.ok) throw new Error(`fetch sample-01.in: ${r.status}`);
      return r.text();
    }),
    fetch('../cases/sample-01.out').then(r => {
      if (!r.ok) throw new Error(`fetch sample-01.out: ${r.status}`);
      return r.text();
    }),
  ]);
  return { src, stdin, expected };
}

// ---------------------------------------------------------------------------
// WorkerAPI — thin wrapper around binji's worker.js (self-hosted in .cache/)
//
// binji's worker protocol (from worker.js / shared_web.js in the repo):
//   init:   postMessage({ id: 'constructor', data: port }, [port])
//   run:    port.postMessage({ id: 'compileLinkRun', data: sourceString })
//   output: { id: 'write', data: string }   (piped back through the port)
//
// The worker's relative fetch() calls (for clang, lld, memfs, sysroot.tar)
// resolve against the worker script's own URL (./.cache/worker.js), so they
// find sibling files in .cache/ correctly without any patching.
// ---------------------------------------------------------------------------
// Self-hosted worker URL (same-origin) — avoids cross-origin Worker block.
// Artifacts must be pre-downloaded to ./.cache/ (see top-of-file comment).
const BINJI_WORKER_URL = './.cache/worker.js';

class BinjiWorkerAPI {
  constructor(onWrite) {
    this._onWrite = onWrite;
    this._worker = new Worker(BINJI_WORKER_URL);

    const channel = new MessageChannel();
    this._port = channel.port1;
    this._port.onmessage = this._onMessage.bind(this);

    // Send constructor message with the remote port
    this._worker.postMessage(
      { id: 'constructor', data: channel.port2 },
      [channel.port2]
    );
  }

  _onMessage(event) {
    if (event.data.id === 'write') {
      this._onWrite(event.data.data);
    }
  }

  /**
   * compileLinkRun(source) → Promise<void>
   *
   * Sends source to the worker. Output is streamed back via onWrite callbacks.
   * There is no explicit "done" signal in binji's protocol — we resolve when
   * the terminal output stream goes quiet (1 second timeout after last write).
   * This matches how the demo's UI works (it just streams output to xterm).
   */
  compileLinkRun(source) {
    return new Promise((resolve, reject) => {
      let timer = null;

      // Override onWrite to detect completion
      const prevOnWrite = this._onWrite;
      this._onWrite = (data) => {
        prevOnWrite(data);
        // Reset the idle timer on every write
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          this._onWrite = prevOnWrite;
          resolve();
        }, 2000); // 2 s quiet = done
      };

      // Kick off compilation
      this._port.postMessage({ id: 'compileLinkRun', data: source });

      // Safety: if nothing is written within 5 min, reject
      setTimeout(() => {
        this._onWrite = prevOnWrite;
        reject(new Error('compileLinkRun timed out (5 min)'));
      }, 5 * 60 * 1000);
    });
  }

  terminate() {
    this._worker.terminate();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let api;
let assets;
let termOutput = '';

function resetTermOutput() { termOutput = ''; }

(async () => {
  $status.textContent = '正在建立 binji worker（從 .cache/ 載入 clang + lld + sysroot，約 58 MB）…';

  // The API object is created when the worker is constructed.  The actual
  // download of clang/lld/sysroot happens on the *first* compileLinkRun call
  // (lazy loading inside shared.js's API class).  We note the wall-clock time
  // from "worker started" to "first compile complete" as initMs because there
  // is no explicit init() in binji's API.

  try {
    assets = await loadAssets();
  } catch (e) {
    $status.textContent = 'BLOCKED: 無法載入測試資源：' + e.message;
    log('ERROR: ' + e.message);
    return;
  }

  const onWrite = (data) => {
    termOutput += data;
    // Strip ANSI escape codes for clean log display
    const clean = data.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
    if (clean.trim()) log(clean.trimEnd());
  };

  try {
    api = new BinjiWorkerAPI(onWrite);
  } catch (e) {
    $status.textContent = 'BLOCKED: 無法建立 Worker：' + e.message +
      '\n\nPossible cause: .cache/ directory is missing or empty.' +
      '\nRun the curl download commands from driver.js top comment to populate it.';
    log('ERROR: ' + e.message);
    return;
  }

  $status.textContent = '就緒（Worker 已建立）。點選「冷編譯」開始測試。';
  log('Worker ready. First compile will trigger ~60 MB download.');
  $cold.disabled = false;
})();

// ---------------------------------------------------------------------------
// Cold compile
// ---------------------------------------------------------------------------
let t_init_start = null;
let coldDone = false;

$cold.onclick = async () => {
  $cold.disabled = true;
  $warm.disabled = true;
  resetTermOutput();

  log('\n--- 冷編譯 (Cold compile) ---');
  log('(clang + lld + sysroot will be downloaded now if not cached)');

  const t0 = performance.now();
  t_init_start = t0;

  try {
    await api.compileLinkRun(assets.src);
  } catch (e) {
    log('ERROR: ' + e.message);
    $cold.disabled = false;
    return;
  }

  const totalMs = (performance.now() - t0).toFixed(0);
  log(`\ncoldTotal (init+compile+link+run): ${totalMs} ms`);
  log('(Record this as coldCompileMs in results.json; initMs cannot be');
  log(' separated without source modification — see driver.js comments.)');

  // Check output
  // binji runs the compiled wasm; stdout is captured by worker via WASI host_write.
  // The worker writes it back via { id: 'write' } messages, which are concatenated
  // into termOutput. We strip ANSI and look for numeric output lines.
  const cleanOutput = termOutput
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^-?\d/.test(l))  // keep lines that look like numbers
    .join('\n');

  log(`\nCaptured numeric output lines:\n${cleanOutput}`);
  const expected = assets.expected.trim();
  const match = cleanOutput.trim() === expected;
  log(`OUTPUT MATCH: ${match}`);
  if (!match) {
    log(`Expected:\n${expected}`);
  }

  coldDone = true;
  $warm.disabled = false;
};

// ---------------------------------------------------------------------------
// Warm compile
// ---------------------------------------------------------------------------
$warm.onclick = async () => {
  $warm.disabled = true;
  resetTermOutput();

  log('\n--- 暖編譯 (Warm compile) ---');
  const wt0 = performance.now();

  try {
    await api.compileLinkRun(assets.src);
  } catch (e) {
    log('ERROR: ' + e.message);
    $warm.disabled = false;
    return;
  }

  const warmMs = (performance.now() - wt0).toFixed(0);
  log(`warmCompileMs (compile+link+run): ${warmMs} ms`);
  $warm.disabled = false;
};
