import { defaultCompiler, defaultRuntime, judge, type Verdict, type CompileOpts } from '@/engine'
import type { QuestionManifestEntry } from '@/data/schema'
import type { CaseData } from './useQuestionData'
import type { SubmissionRecord } from '@/store'

export interface RunRequest {
  meta: QuestionManifestEntry
  source: string
  cases: CaseData[]
  optimization: CompileOpts['optimization']
}

export type RunResult =
  | {
      kind: 'compile-error'
      stderr: string
      diagnostics: { severity: string; message: string; line?: number; column?: number }[]
      compileMs: number
    }
  | {
      kind: 'graded'
      perCase: Record<string, { verdict: Verdict; stdout: string; stderr: string; ms: number }>
      overall: SubmissionRecord['overall']
      compileMs: number
      totalRunMs: number
      cacheHit: boolean
    }

export async function runJudge(req: RunRequest): Promise<RunResult> {
  const compileResult = await defaultCompiler.compile(req.source, {
    optimization: req.optimization,
  })
  if (!compileResult.ok) {
    return {
      kind: 'compile-error',
      stderr: compileResult.stderr,
      diagnostics: compileResult.diagnostics,
      compileMs: compileResult.ms,
    }
  }

  const perCase: Record<string, { verdict: Verdict; stdout: string; stderr: string; ms: number }> = {}
  let allRunMs = 0
  let overall: SubmissionRecord['overall'] = 'AC'

  for (const c of req.cases) {
    const run = await defaultRuntime.run(compileResult.wasm, c.stdin, req.meta.timeLimitMs)
    allRunMs += run.ms
    if (run.kind === 'tle') {
      perCase[c.id] = { verdict: 'TLE', stdout: run.partialStdout, stderr: run.partialStderr, ms: run.ms }
      overall = overall === 'AC' ? 'TLE' : overall
      continue
    }
    if (run.kind === 'crash') {
      perCase[c.id] = { verdict: 'RE', stdout: '', stderr: run.stderr, ms: run.ms }
      overall = overall === 'AC' ? 'RE' : overall
      continue
    }
    if (run.exitCode !== 0) {
      perCase[c.id] = { verdict: 'RE', stdout: run.stdout, stderr: run.stderr, ms: run.ms }
      overall = overall === 'AC' ? 'RE' : overall
      continue
    }
    const v = judge({ expected: c.expected, actual: run.stdout, mode: req.meta.judge })
    perCase[c.id] = { verdict: v, stdout: run.stdout, stderr: run.stderr, ms: run.ms }
    if (v === 'WA' && overall === 'AC') overall = 'WA'
  }

  return {
    kind: 'graded',
    perCase,
    overall,
    compileMs: compileResult.ms,
    totalRunMs: allRunMs,
    cacheHit: compileResult.cacheHit,
  }
}
