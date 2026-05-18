import type { JudgeMode } from '@/data/schema'

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE'

export interface JudgeInput {
  expected: string
  actual: string
  mode: JudgeMode
}

/**
 * Compare actual program output against expected output per the question's judge mode.
 * Returns 'AC' if outputs match, 'WA' otherwise.
 *
 * This function only decides AC vs WA. TLE / RE are decided by the runtime layer
 * (timeout, non-zero exit, exception) and shouldn't reach here.
 */
export function judge(input: JudgeInput): 'AC' | 'WA' {
  const { expected, actual, mode } = input
  switch (mode.mode) {
    case 'exact':
      return expected === actual ? 'AC' : 'WA'
    case 'whitespace':
      return normalizeWhitespace(expected) === normalizeWhitespace(actual) ? 'AC' : 'WA'
    case 'float':
      return compareFloatTokens(expected, actual, mode.eps) ? 'AC' : 'WA'
  }
}

/**
 * Strip trailing whitespace per line + trailing blank lines, then compare.
 * Matches what most school OJs (and our spec §6.2) define as 'whitespace' mode.
 */
export function normalizeWhitespace(s: string): string {
  const lines = s.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

/**
 * Tokenize on whitespace, compare token-by-token.
 * Numeric tokens are compared as numbers within `eps`; non-numeric tokens compared as strings.
 * Token counts must match.
 */
export function compareFloatTokens(expected: string, actual: string, eps: number): boolean {
  const exp = expected.trim().split(/\s+/).filter(Boolean)
  const act = actual.trim().split(/\s+/).filter(Boolean)
  if (exp.length !== act.length) return false
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i]
    const a = act[i]
    const en = Number(e)
    const an = Number(a)
    const bothNumeric = !Number.isNaN(en) && !Number.isNaN(an)
    if (bothNumeric) {
      if (Math.abs(en - an) > eps) return false
    } else if (e !== a) {
      return false
    }
  }
  return true
}
