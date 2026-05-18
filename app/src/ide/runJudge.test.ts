import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CaseData } from './useQuestionData'

vi.mock('@/engine', async () => {
  return {
    defaultCompiler: { compile: vi.fn() },
    defaultRuntime: { run: vi.fn() },
    judge: vi.fn(({ expected, actual }) => (expected === actual ? 'AC' : 'WA')),
  }
})

import { defaultCompiler, defaultRuntime } from '@/engine'
import { runJudge } from './runJudge'

const meta = {
  id: 'mock',
  title: 'mock',
  gpeYear: 2024, gpeSession: 1, gpeNo: 'X1',
  uvaId: null, uvaName: null,
  tags: [], difficulty: 'easy' as const,
  timeLimitMs: 1000, memLimitMb: 256,
  judge: { mode: 'whitespace' as const },
  generatedSeeds: [],
  stats: { appearanceCount: 0, lastAppearedYear: 2024, acRate: 1, recommendationScore: 0 },
  caseList: [{ id: 's-01', visibility: 'sample' as const }],
}

const cases: CaseData[] = [{ id: 's-01', visibility: 'sample', stdin: '1', expected: '1' }]

beforeEach(() => {
  vi.mocked(defaultCompiler.compile).mockReset()
  vi.mocked(defaultRuntime.run).mockReset()
})

describe('runJudge', () => {
  it('reports compile-error when compiler returns ok:false', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: false, diagnostics: [], stderr: 'syntax error', ms: 100,
    })
    const res = await runJudge({ meta, source: 'bad', cases, optimization: 'O0' })
    expect(res.kind).toBe('compile-error')
    if (res.kind === 'compile-error') expect(res.stderr).toBe('syntax error')
  })

  it('returns graded AC when run output matches expected', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: true, wasm: new Uint8Array(), warnings: [], cacheHit: false, ms: 50,
    })
    vi.mocked(defaultRuntime.run).mockResolvedValue({
      kind: 'ok', stdout: '1', stderr: '', exitCode: 0, ms: 5,
    })
    const res = await runJudge({ meta, source: 'good', cases, optimization: 'O0' })
    expect(res.kind).toBe('graded')
    if (res.kind === 'graded') {
      expect(res.overall).toBe('AC')
      expect(res.perCase['s-01'].verdict).toBe('AC')
    }
  })

  it('returns overall=TLE if any case TLE', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: true, wasm: new Uint8Array(), warnings: [], cacheHit: false, ms: 50,
    })
    vi.mocked(defaultRuntime.run).mockResolvedValue({
      kind: 'tle', partialStdout: '', partialStderr: '', ms: 1000,
    })
    const res = await runJudge({ meta, source: 'slow', cases, optimization: 'O0' })
    if (res.kind === 'graded') expect(res.overall).toBe('TLE')
  })

  it('returns overall=RE if exit code non-zero', async () => {
    vi.mocked(defaultCompiler.compile).mockResolvedValue({
      ok: true, wasm: new Uint8Array(), warnings: [], cacheHit: false, ms: 50,
    })
    vi.mocked(defaultRuntime.run).mockResolvedValue({
      kind: 'ok', stdout: '', stderr: 'segfault', exitCode: 139, ms: 10,
    })
    const res = await runJudge({ meta, source: 'crashy', cases, optimization: 'O0' })
    if (res.kind === 'graded') expect(res.overall).toBe('RE')
  })
})
