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

interface EmceptionFs extends Comlink.ProxyMarked {
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
  const baseUrl = typeof window === 'undefined' ? '/' : import.meta.env.BASE_URL
  const workerUrl = `${baseUrl}emception/emception.worker.bundle.worker.js`
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
    await proxy.fileSystem.mkdirTree(POLYFILL_DIR)
    await proxy.fileSystem.writeFile(POLYFILL_PATH, BITS_STDCPP_POLYFILL)
  })()
  return initPromise
}

export function buildEmCommand(opt: Optimization): string {
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

export function parseDiagnostics(stderr: string): ClangDiagnostic[] {
  const out: ClangDiagnostic[] = []
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
