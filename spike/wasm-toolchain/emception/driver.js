/**
 * Emception evaluation driver
 *
 * API source: https://github.com/jprendes/emception
 *
 * DISTRIBUTION CHANNEL
 *   - No CDN. Emception must be self-hosted from a local build produced by
 *     `./build-with-docker.sh` in the emception repo. Output lands in
 *     `build/emception/`. The live demo at https://jprendes.github.io/emception/
 *     is a webpack bundle that aliases `emception` → `../build/emception`.
 *   - There is an npm package (@jprendes/emception on GitHub Package Registry),
 *     but it only contains the compiled llvm-box wasm, not the full runtime.
 *   - No esm.sh / jsDelivr / unpkg entry exists.
 *
 * ACTUAL API SURFACE (demo/emception.js)
 *   class Emception {
 *     fileSystem: FileSystem          — shared virtual FS (Emscripten MEMFS/IDBFS)
 *     async init(): Promise<void>     — downloads + unpacks toolchain packs (~100–200 MB),
 *                                       spawns llvm-box / binaryen-box / python / node
 *                                       worker processes
 *     run(cmd: string): Promise<{ returncode: number, stdout: string, stderr: string }>
 *                                     — runs ONE emscripten command (e.g. "em++ ...") inside
 *                                       the virtual FS; output is written to /working/
 *     onstdout, onstderr: (str) => void  — tap into real-time output
 *     onprocessstart, onprocessend: callbacks
 *   }
 *
 * IMPORTANT DIFFERENCES FROM THE ILLUSTRATIVE SKELETON
 *   - There is NO emception.compile(src) → {wasm} API.
 *   - Compilation output goes to the *virtual filesystem* at /working/.
 *     The driver reads the compiled .wasm back out with fileSystem.readFile().
 *   - Running the compiled wasm requires WebAssembly.instantiate + a WASI-like
 *     environment, not a built-in emception.run(wasm, {stdin}).
 *     Here we use the native WebAssembly API with a minimal import stub that
 *     wires stdin (via a pre-loaded buffer), stdout, and stderr.
 *   - Emception requires SharedArrayBuffer (COOP/COEP headers) because some of
 *     its internal Emscripten modules use shared memory.
 *     Add these headers to your dev server (e.g. vite.config.js / vite.json):
 *       "Cross-Origin-Opener-Policy": "same-origin"
 *       "Cross-Origin-Embedder-Policy": "require-corp"
 *
 * SETUP BEFORE RUNNING
 *   1. Clone https://github.com/jprendes/emception
 *   2. Run ./build-with-docker.sh  (takes ~1 h)
 *   3. Symlink or copy the build output so that:
 *        <this dir>/emception-lib/ → <emception repo>/build/emception/
 *      e.g.:  mklink /D emception-lib ..\..\..\emception\build\emception
 *   4. Serve the spike/ directory with a server that sends COOP/COEP headers,
 *      e.g.: npx vite --config ../vite-coop.config.js
 *   5. Open http://localhost:5173/emception/
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

  // The WASI snapshot_preview1 imports needed for a simple I/O program.
  const wasiImports = {
    wasi_snapshot_preview1: {
      // fd_write: used for stdout (fd=1) and stderr (fd=2)
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
        return 0; // WASI_ESUCCESS
      },
      // fd_read: used for stdin (fd=0)
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
      fd_seek()  { return 70; }, // WASI_ESPIPE – not seekable
      fd_fdstat_get(fd, statPtr) {
        // Report all fds as character devices
        const mem = new DataView(instance.exports.memory.buffer);
        mem.setUint8(statPtr, fd < 3 ? 2 : 0); // filetype: 2=char_device
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
// Compile helper — writes src to virtual FS, runs em++, reads back .wasm
// ---------------------------------------------------------------------------
async function compile(emception, src) {
  // Write the source into the shared virtual filesystem
  emception.fileSystem.writeFile('/working/main.cpp', src);

  // Run em++ targeting a standalone WASM binary (no JS glue, WASI ABI)
  // -sSTANDALONE_WASM=1 produces main.wasm that uses the WASI ABI, so we can
  // run it with a minimal hand-rolled WASI shim instead of Emscripten's full
  // JS runtime. This keeps the "run" step self-contained in the browser.
  const result = await emception.run(
    'em++ -O2 -std=c++17 -sSTANDALONE_WASM=1 -sEXIT_RUNTIME=1 main.cpp -o main.wasm'
  );

  if (result.returncode !== 0) {
    throw new Error(`em++ failed (rc=${result.returncode}):\n${result.stderr}`);
  }

  // Read the compiled wasm back out of the virtual filesystem
  const wasmBytes = emception.fileSystem.readFile('/working/main.wasm');
  return wasmBytes; // Uint8Array
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let emception, sample;
let coldWasmBytes;

(async () => {
  $status.textContent = '正在載入 emception 模組…';

  // Emception has no CDN; modules must be loaded from a local build.
  // The dynamic import path below assumes you have symlinked / copied
  // <emception repo>/build/emception/ to ./emception-lib/ relative to this file.
  let EmceptionClass;
  try {
    const mod = await import('./emception-lib/emception.js');
    EmceptionClass = mod.default;
  } catch (e) {
    $status.textContent =
      'BLOCKED: 無法載入 emception 模組。\n\n' +
      '請先建置 emception（需要 Docker + ~1 h）後再執行此測試：\n' +
      '  1. git clone https://github.com/jprendes/emception\n' +
      '  2. cd emception && ./build-with-docker.sh\n' +
      '  3. mklink /D spike/wasm-toolchain/emception/emception-lib ' +
      '<emception repo>/build/emception\n' +
      '  4. 以支援 COOP/COEP 標頭的伺服器重新啟動\n\n' +
      '錯誤：' + e.message;
    log('BLOCKED: ' + e.message);
    return;
  }

  $status.textContent = '正在初始化 emception（下載工具鏈，約 100–200 MB）…';
  const t0 = performance.now();
  emception = new EmceptionClass();
  await emception.init();
  const initMs = (performance.now() - t0).toFixed(0);

  sample = await loadSample();

  $status.textContent = `就緒。init 耗時 ${initMs} ms。`;
  log(`init ${initMs} ms`);
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
    // Compile
    const ct0 = performance.now();
    coldWasmBytes = await compile(emception, sample.src);
    const coldCompileMs = (performance.now() - ct0).toFixed(0);
    log(`coldCompileMs: ${coldCompileMs} ms`);
    log(`wasm bytes: ${coldWasmBytes.byteLength}`);

    // Run
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
