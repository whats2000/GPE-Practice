import { describe, it, expect, beforeEach } from 'vitest'
import { hashSource, getCached, putCached, _clearForTests } from './cache'

describe('hashSource', () => {
  it('is deterministic', async () => {
    const a = await hashSource('int main(){return 0;}', 'O0')
    const b = await hashSource('int main(){return 0;}', 'O0')
    expect(a).toBe(b)
  })

  it('differs when optimization differs', async () => {
    const o0 = await hashSource('int main(){return 0;}', 'O0')
    const o2 = await hashSource('int main(){return 0;}', 'O2')
    expect(o0).not.toBe(o2)
  })

  it('produces 64 hex chars (SHA-256)', async () => {
    const h = await hashSource('x', 'O0')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('IDB cache', () => {
  beforeEach(async () => {
    await _clearForTests()
  })

  it('round-trips wasm bytes by key', async () => {
    const key = 'abc'
    const wasm = new Uint8Array([0, 1, 2, 3])
    expect(await getCached(key)).toBeNull()
    await putCached(key, wasm)
    const got = await getCached(key)
    expect(got).toEqual(wasm)
  })

  it('returns null for missing keys', async () => {
    expect(await getCached('does-not-exist')).toBeNull()
  })
})
