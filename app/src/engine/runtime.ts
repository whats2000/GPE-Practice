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
      const result = (await WebAssembly.instantiate(wasm, imports)) as unknown as WebAssembly.WebAssemblyInstantiatedSource
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
