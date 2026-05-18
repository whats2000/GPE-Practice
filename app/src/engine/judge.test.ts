import { describe, it, expect } from 'vitest'
import { judge, normalizeWhitespace, compareFloatTokens } from './judge'

describe('normalizeWhitespace', () => {
  it('strips trailing spaces/tabs per line', () => {
    expect(normalizeWhitespace('a  \nb\t\n')).toBe('a\nb')
  })

  it('drops trailing blank lines', () => {
    expect(normalizeWhitespace('a\n\n\n')).toBe('a')
  })

  it('treats CRLF and LF identically', () => {
    expect(normalizeWhitespace('a\r\nb\r\n')).toBe('a\nb')
  })

  it('preserves internal whitespace', () => {
    expect(normalizeWhitespace('a  b')).toBe('a  b')
  })
})

describe('compareFloatTokens', () => {
  it('matches identical numbers exactly', () => {
    expect(compareFloatTokens('1 2 3', '1 2 3', 1e-6)).toBe(true)
  })

  it('matches numbers within eps', () => {
    expect(compareFloatTokens('1.0', '1.00000001', 1e-6)).toBe(true)
  })

  it('rejects numbers outside eps', () => {
    expect(compareFloatTokens('1.0', '1.01', 1e-6)).toBe(false)
  })

  it('compares non-numeric tokens as strings', () => {
    expect(compareFloatTokens('OK 1.5', 'OK 1.50001', 1e-3)).toBe(true)
    expect(compareFloatTokens('OK 1.5', 'NO 1.5', 1e-3)).toBe(false)
  })

  it('rejects mismatched token counts', () => {
    expect(compareFloatTokens('1 2', '1 2 3', 1e-6)).toBe(false)
  })
})

describe('judge', () => {
  it('exact mode: byte-equal AC', () => {
    expect(judge({ expected: '14\n1\n', actual: '14\n1\n', mode: { mode: 'exact' } })).toBe('AC')
  })

  it('exact mode: byte-different WA (trailing space differs)', () => {
    expect(judge({ expected: '14\n', actual: '14 \n', mode: { mode: 'exact' } })).toBe('WA')
  })

  it('whitespace mode: trailing space tolerated', () => {
    expect(
      judge({ expected: '14\n1\n', actual: '14 \n1\n\n', mode: { mode: 'whitespace' } }),
    ).toBe('AC')
  })

  it('whitespace mode: token order matters', () => {
    expect(judge({ expected: '1 2\n', actual: '2 1\n', mode: { mode: 'whitespace' } })).toBe('WA')
  })

  it('float mode: tolerance applied', () => {
    expect(
      judge({ expected: '3.14159', actual: '3.14158', mode: { mode: 'float', eps: 1e-4 } }),
    ).toBe('AC')
  })
})
