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
