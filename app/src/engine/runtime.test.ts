import { describe, it, expect } from 'vitest'
import { createShimState } from './wasiShim'

describe('createShimState', () => {
  it('encodes stdin to bytes with UTF-8', () => {
    const s = createShimState('héllo')
    expect(s.stdinBytes.length).toBe(6)
    expect(s.stdinPos).toBe(0)
  })

  it('starts with empty stdout / stderr buffers', () => {
    const s = createShimState('')
    expect(s.stdoutBuf).toBe('')
    expect(s.stderrBuf).toBe('')
    expect(s.exited).toBeNull()
  })

  it('records startedAt', () => {
    const before = performance.now()
    const s = createShimState('')
    expect(s.startedAt).toBeGreaterThanOrEqual(before)
  })
})

// Note: full end-to-end runtime tests require real wasm and live in Phase 4
// (Playwright browser tests). The shim's correctness was validated by the
// Phase 0 spike's `OUTPUT MATCH: true` on emception's compiled sample.cpp.
