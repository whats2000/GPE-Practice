/**
 * binji/wasm-clang evaluation driver
 *
 * Approach: Option A (programmatic API via cross-origin worker)
 *
 * WHY OPTION A:
 *   - binji.github.io serves all artifacts with "Access-Control-Allow-Origin: *"
 *     (verified via curl -sI https://binji.github.io/wasm-clang/shared.js).
 *   - shared.js exposes a rich `API` class with `compileLinkRun(contents)` —
 *     this is the single call that runs clang → lld → wasm-execute on a source
 *     string. No manual UI interaction required.
 *   - worker.js (also CORS-accessible) wraps that API in a Web Worker and
 *     accepts { id: 'compileLinkRun', data: sourceString } postMessage messages.
 *
 * ARCHITECTURE:
 *   This driver creates a dedicated Web Worker pointing at binji's worker.js
 *   (cross-origin, but CORS-allowed). The worker's fetch() calls for clang,
 *   lld, memfs, and sysroot.tar are all relative — they resolve against
 *   https://binji.github.io/wasm-clang/. Because the worker itself is served
 *   from that origin, relative fetches work correctly.
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
 * PAYLOAD (as of May 2026, fetched from binji.github.io):
 *   clang        ~31 MB  (clang compiler, WASM+WASI)
 *   lld          ~19 MB  (lld linker, WASM+WASI)
 *   sysroot.tar  ~ 9 MB  (C++ headers + libc++-wasm runtime libs)
 *   memfs        ~338 KB (in-memory WASI filesystem WASM module)
 *   JS glue      ~ 37 KB (shared.js + worker.js)
 *   Total        ~60 MB transferred on cold init
 *
 * HOW TO RUN:
 *   Serve spike/wasm-toolchain/ from any static file server — no special
 *   headers required (binji's artifacts come from binji.github.io, not
 *   your origin). Example:
 *     npx serve spike/wasm-toolchain    # or python -m http.server in that dir
 *   Then open http://localhost:3000/binji/
 *
 *   1. Wait for "就緒" (ready) — this downloads clang, lld, sysroot (~60 MB).
 *      Record the initMs shown.
 *   2. Click "冷編譯" and wait. Record coldCompileMs + runMs.
 *   3. Click "暖編譯". Record warmCompileMs.
 *   4. Copy the log output into results.json.
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
// WorkerAPI — thin wrapper around binji's worker.js (cross-origin, CORS OK)
//
// binji's worker protocol (from worker.js / shared_web.js in the repo):
//   init:   postMessage({ id: 'constructor', data: port }, [port])
//   run:    port.postMessage({ id: 'compileLinkRun', data: sourceString })
//   output: { id: 'write', data: string }   (piped back through the port)
//
// The worker's relative fetch() calls resolve against its own origin
// (binji.github.io), so clang/lld/sysroot are fetched correctly.
// ---------------------------------------------------------------------------
const BINJI_WORKER_URL = 'https://binji.github.io/wasm-clang/worker.js';

class BinjiWorkerAPI {
  constructor(onWrite) {
    this._onWrite = onWrite;
    this._worker = new Worker(BINJI_WORKER_URL, { credentials: 'omit' });

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
  $status.textContent = '正在建立 binji worker（下載 clang + lld + sysroot，約 60 MB）…';

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
      '\n\nPossible cause: browser blocks cross-origin workers without COEP.' +
      '\nTry opening the page WITHOUT COOP/COEP headers, or use Firefox/Chrome' +
      ' (binji demo does not need SharedArrayBuffer).';
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
