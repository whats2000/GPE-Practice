import { describe, it, expect } from 'vitest'
import { detectTarget, encodeBase64Utf8 } from './octokitClient'

describe('detectTarget', () => {
  it('falls back to whats2000/GPE-Practice in non-github.io contexts', () => {
    expect(detectTarget()).toEqual({ owner: 'whats2000', repo: 'GPE-Practice' })
  })
})

describe('encodeBase64Utf8', () => {
  it('handles ASCII', () => {
    expect(encodeBase64Utf8('hello')).toBe('aGVsbG8=')
  })

  it('handles Traditional Chinese without throwing', () => {
    const enc = encodeBase64Utf8('題目')
    expect(enc).toMatch(/^[A-Za-z0-9+/]+=*$/)
    const bytes = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    expect(decoded).toBe('題目')
  })

  it('handles emoji (4-byte UTF-8)', () => {
    const enc = encodeBase64Utf8('👍')
    const bytes = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('👍')
  })
})
