/**
 * Emception evaluation driver — pivoted to gh-pages pre-built artifacts
 *
 * Pivot reason: local Docker build of emception OOMed twice (at ~83% and ~92% of
 * the LLVM link step). Instead of rebuilding, we use the webpack bundle that
 * powers the live demo at https://jprendes.github.io/emception/.
 *
 * Architecture:
 *   - emception.worker.bundle.worker.js  — self-contained webpack worker bundle
 *     (Comlink.expose + full emception runtime + lazy sysroot loader)
 *   - cecdfcda360457a8f204.br            — root.pack.br (23.5 MB brotli archive
 *     containing llvm-box.wasm, binaryen-box.wasm, python.wasm, quicknode.wasm,
 *     wasm-package.wasm) — fetched by the worker on init
 *   - f0283badd42fe745cbe4.wasm          — wasm-package tool (804 KB)
 *   - 9d1e542b80004e27297f.wasm          — brotli decompressor (147 KB)
 *   - 44 sysroot .a files (hashed names) — lazily XHR-fetched by the worker
 *     when the linker first accesses each library (only the needed variants)
 *   - comlink.mjs                        — Comlink 4.4.1 for Worker RPC
 *
 * All files must live in ./emception/.cache/ (same-origin) because the page is
 * served with COEP: require-corp, which blocks cross-origin resources that lack
 * CORP headers (GitHub Pages ACAO:* is not sufficient under COEP).
 *
 * The worker bundle derives its public path from self.location.href, so placing
 * it inside .cache/ makes it automatically fetch the hashed .a files from
 * .cache/hash.a — no patching needed.
 *
 * COOP/COEP server: node spike/wasm-toolchain/serve-coop-coep.mjs
 *
 * MANIFEST: see MANIFEST.md in this directory.
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
// Load sample assets
// ---------------------------------------------------------------------------
async function loadSample() {
  const [src, stdin, expected] = await Promise.all([
    fetch('../sample.cpp').then(r => { if (!r.ok) throw new Error(`fetch sample.cpp: ${r.status}`); return r.text(); }),
    fetch('../cases/sample-01.in').then(r => { if (!r.ok) throw new Error(`fetch sample-01.in: ${r.status}`); return r.text(); }),
    fetch('../cases/sample-01.out').then(r => { if (!r.ok) throw new Error(`fetch sample-01.out: ${r.status}`); return r.text(); }),
  ]);
  return { src, stdin, expected };
}

// ---------------------------------------------------------------------------
// Minimal WASI-like runner for a bare wasm32 binary compiled with
// em++ -sSTANDALONE_WASM=1 (no JS glue, WASI ABI).
// ---------------------------------------------------------------------------
async function runWasm(wasmBytes, stdinText) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stdinBytes = encoder.encode(stdinText);
  let stdinPos = 0;
  let stdoutBuf = '';
  let stderrBuf = '';

  const wasiImports = {
    wasi_snapshot_preview1: {
      fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
        const mem = new DataView(instance.exports.memory.buffer);
        let total = 0;
        for (let i = 0; i < iovsLen; i++) {
          const ptr = mem.getUint32(iovsPtr + i * 8, true);
          const len = mem.getUint32(iovsPtr + i * 8 + 4, true);
          const chunk = decoder.decode(new Uint8Array(instance.exports.memory.buffer, ptr, len));
          if (fd === 1) stdoutBuf += chunk;
          else stderrBuf += chunk;
          total += len;
        }
        mem.setUint32(nwrittenPtr, total, true);
        return 0;
      },
      fd_read(fd, iovsPtr, iovsLen, nreadPtr) {
        if (fd !== 0) return 8; // WASI_EBADF
        const mem = new DataView(instance.exports.memory.buffer);
        let total = 0;
        for (let i = 0; i < iovsLen; i++) {
          const ptr = mem.getUint32(iovsPtr + i * 8, true);
          const len = mem.getUint32(iovsPtr + i * 8 + 4, true);
          const avail = Math.min(len, stdinBytes.length - stdinPos);
          new Uint8Array(instance.exports.memory.buffer).set(stdinBytes.subarray(stdinPos, stdinPos + avail), ptr);
          stdinPos += avail;
          total += avail;
        }
        mem.setUint32(nreadPtr, total, true);
        return 0;
      },
      proc_exit(code) { throw Object.assign(new Error('proc_exit'), { code }); },
      fd_close() { return 0; },
      fd_seek()  { return 70; }, // WASI_ESPIPE
      fd_fdstat_get(fd, statPtr) {
        const mem = new DataView(instance.exports.memory.buffer);
        mem.setUint8(statPtr, fd < 3 ? 2 : 0);
        return 0;
      },
      environ_get()      { return 0; },
      environ_sizes_get(countPtr, bufSizePtr) {
        const mem = new DataView(instance.exports.memory.buffer);
        mem.setUint32(countPtr,   0, true);
        mem.setUint32(bufSizePtr, 0, true);
        return 0;
      },
      args_get()      { return 0; },
      args_sizes_get(argcPtr, argvBufSizePtr) {
        const mem = new DataView(instance.exports.memory.buffer);
        mem.setUint32(argcPtr,       0, true);
        mem.setUint32(argvBufSizePtr, 0, true);
        return 0;
      },
      clock_time_get(id, precision, timePtr) {
        const mem = new DataView(instance.exports.memory.buffer);
        const ns = BigInt(Math.round(performance.now() * 1e6));
        mem.setBigUint64(timePtr, ns, true);
        return 0;
      },
    },
    env: {},
  };

  let instance;
  let exitCode = 0;
  try {
    const result = await WebAssembly.instantiate(wasmBytes, wasiImports);
    instance = result.instance;
    instance.exports._start?.();
  } catch (e) {
    if (e.code !== undefined) {
      exitCode = e.code;
    } else {
      throw e;
    }
  }

  return { stdout: stdoutBuf, stderr: stderrBuf, exitCode };
}

// ---------------------------------------------------------------------------
// <bits/stdc++.h> polyfill — Emscripten's libc++ doesn't ship the libstdc++-only
// "bits/stdc++.h" convenience header. GPE-style sources rely on it heavily,
// so we install a minimal polyfill into /working/bits/ and pass -I/working to
// the compiler. Same UX as having the real header; trivial maintenance.
// ---------------------------------------------------------------------------
const BITS_STDCPP_POLYFILL = `// bits/stdc++.h polyfill for libc++. Includes the common standard headers
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
`;

async function installPolyfill(emception) {
  await emception.fileSystem.mkdirTree('/working/bits');
  await emception.fileSystem.writeFile('/working/bits/stdc++.h', BITS_STDCPP_POLYFILL);
}

// ---------------------------------------------------------------------------
// Compile helper — writes src to virtual FS, runs em++, reads back .wasm
// ---------------------------------------------------------------------------
async function compile(emception, src) {
  // Write source into the worker's virtual filesystem
  await emception.fileSystem.writeFile('/working/main.cpp', src);

  // Run em++ targeting a standalone WASM binary (WASI ABI, no JS glue).
  // -I/working/bits is intentionally NOT used — instead we expose -I/working
  // so the user's `#include <bits/stdc++.h>` resolves to /working/bits/stdc++.h.
  const result = await emception.run(
    'em++ -O2 -std=c++17 -I/working -sSTANDALONE_WASM=1 main.cpp -o main.wasm'
  );

  if (result.returncode !== 0) {
    throw new Error(`em++ failed (rc=${result.returncode}):\n${result.stderr}`);
  }

  // Read compiled wasm back from the virtual filesystem
  const wasmBytes = await emception.fileSystem.readFile('/working/main.wasm');
  return wasmBytes; // Uint8Array
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let emception, sample;
let coldWasmBytes;

(async () => {
  $status.textContent = '正在載入 emception 工作執行緒…';

  // Verify SharedArrayBuffer is available (requires COOP/COEP headers)
  if (typeof SharedArrayBuffer === 'undefined') {
    $status.textContent =
      'BLOCKED: SharedArrayBuffer 不可用。\n\n' +
      '請以支援 COOP/COEP 標頭的伺服器啟動：\n' +
      '  node spike/wasm-toolchain/serve-coop-coep.mjs\n' +
      '然後開啟 http://localhost:5173/emception/';
    log('BLOCKED: SharedArrayBuffer not available');
    return;
  }

  // Import Comlink from local same-origin cache
  let Comlink;
  try {
    const comlinkModule = await import('./.cache/comlink.mjs');
    Comlink = comlinkModule;
  } catch (e) {
    $status.textContent =
      'BLOCKED: 無法載入 Comlink。\n\n' +
      '請先執行下載腳本（詳見 MANIFEST.md）。\n\n' +
      '錯誤：' + e.message;
    log('BLOCKED: ' + e.message);
    return;
  }

  // Spin up the emception worker bundle from local cache
  let worker;
  try {
    worker = new Worker('./.cache/emception.worker.bundle.worker.js');
  } catch (e) {
    $status.textContent =
      'BLOCKED: 無法建立 Worker。\n\n' +
      '確認 .cache/emception.worker.bundle.worker.js 存在。\n\n' +
      '錯誤：' + e.message;
    log('BLOCKED: ' + e.message);
    return;
  }

  // Wrap with Comlink so we can call methods asynchronously
  emception = Comlink.wrap(worker);

  $status.textContent = '正在初始化 emception（載入工具鏈，約 24+ MB）…';
  const t0 = performance.now();

  try {
    await emception.init();
  } catch (e) {
    $status.textContent = 'FAILED 在 init(): ' + e.message;
    log('ERROR in init(): ' + e.message);
    console.error(e);
    return;
  }

  const initMs = (performance.now() - t0).toFixed(0);

  // Install the <bits/stdc++.h> polyfill once at init time
  await installPolyfill(emception);

  sample = await loadSample();

  $status.textContent = `就緒。init 耗時 ${initMs} ms。`;
  log(`init ${initMs} ms (含 <bits/stdc++.h> 補丁)`);
  $cold.disabled = false;
})().catch((e) => {
  $status.textContent = 'FAILED: ' + e.message;
  log('ERROR: ' + e.message);
  console.error(e);
});

// ---------------------------------------------------------------------------
// Cold compile button
// ---------------------------------------------------------------------------
$cold.onclick = async () => {
  $cold.disabled = true;
  $warm.disabled = true;
  log('--- 冷編譯 ---');

  try {
    const ct0 = performance.now();
    coldWasmBytes = await compile(emception, sample.src);
    const coldCompileMs = (performance.now() - ct0).toFixed(0);
    log(`coldCompileMs: ${coldCompileMs} ms`);
    log(`wasm bytes: ${coldWasmBytes.byteLength}`);

    const rt0 = performance.now();
    const runResult = await runWasm(coldWasmBytes.buffer.slice(
      coldWasmBytes.byteOffset,
      coldWasmBytes.byteOffset + coldWasmBytes.byteLength
    ), sample.stdin);
    const runMs = (performance.now() - rt0).toFixed(0);

    log(`runMs: ${runMs} ms`);
    log(`stdout:\n${runResult.stdout}`);
    const match = runResult.stdout.trim() === sample.expected.trim();
    log(`OUTPUT MATCH: ${match}`);
    if (!match) {
      log(`expected:\n${sample.expected}`);
    }

    $warm.disabled = false;
  } catch (e) {
    log('ERROR: ' + e.message);
    console.error(e);
    $cold.disabled = false;
  }
};

// ---------------------------------------------------------------------------
// Warm compile button
// ---------------------------------------------------------------------------
$warm.onclick = async () => {
  $warm.disabled = true;
  log('--- 暖編譯 ---');
  try {
    const wt0 = performance.now();
    await compile(emception, sample.src);
    const warmCompileMs = (performance.now() - wt0).toFixed(0);
    log(`warmCompileMs: ${warmCompileMs} ms`);
  } catch (e) {
    log('ERROR: ' + e.message);
    console.error(e);
  } finally {
    $warm.disabled = false;
  }
};
