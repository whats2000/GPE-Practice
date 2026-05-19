#!/usr/bin/env tsx
/**
 * Compile data/questions/<id>/solutions/reference.cpp natively, run it against
 * every cases/*.in, diff against cases/*.out per the question's judge mode.
 *
 * Used by validate-pr.yml.
 *
 * Run locally:
 *   cd tools && pnpm exec tsx run-reference.ts --question-id b056-two-sum
 *
 * Exits 0 if all cases agree with reference; 1 on any disagreement.
 * If reference.cpp is the empty template, exits 0 with a warning (the PR is
 * marked as draft elsewhere).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

type JudgeMode =
  | { mode: 'exact' }
  | { mode: 'whitespace' }
  | { mode: 'float'; eps: number }

function normalizeWhitespace(s: string): string {
  const lines = s.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

function compareFloatTokens(expected: string, actual: string, eps: number): boolean {
  const exp = expected.trim().split(/\s+/).filter(Boolean)
  const act = actual.trim().split(/\s+/).filter(Boolean)
  if (exp.length !== act.length) return false
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i], a = act[i]
    const en = Number(e), an = Number(a)
    if (!Number.isNaN(en) && !Number.isNaN(an)) {
      if (Math.abs(en - an) > eps) return false
    } else if (e !== a) {
      return false
    }
  }
  return true
}

function judge(expected: string, actual: string, mode: JudgeMode): boolean {
  switch (mode.mode) {
    case 'exact': return expected === actual
    case 'whitespace': return normalizeWhitespace(expected) === normalizeWhitespace(actual)
    case 'float': return compareFloatTokens(expected, actual, mode.eps)
  }
}

const { values } = parseArgs({
  options: { 'question-id': { type: 'string' } },
  strict: true,
})

const qid = values['question-id']
if (!qid) {
  console.error('Usage: run-reference.ts --question-id <id>')
  process.exit(1)
}

const qDir = join(QUESTIONS_DIR, qid)
const refSrc = join(qDir, 'solutions', 'reference.cpp')
if (!existsSync(refSrc)) {
  console.error(`Missing: ${refSrc}`)
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const mode: JudgeMode = meta.judge

const refText = readFileSync(refSrc, 'utf8')
if (refText.length < 200 && refText.includes('// TODO')) {
  console.warn(`reference.cpp for ${qid} is the empty template — skipping (PR remains draft).`)
  process.exit(0)
}

const refBin = join(tmpdir(), `ref_${qid}.exe`)
const c = spawnSync('g++', ['-O2', '-std=c++17', refSrc, '-o', refBin], { encoding: 'utf8' })
if (c.status !== 0) {
  console.error(`Compile failed:\n${c.stderr}`)
  process.exit(1)
}

const casesDir = join(qDir, 'cases')
if (!existsSync(casesDir)) {
  console.error(`No cases dir at ${casesDir}`)
  process.exit(1)
}

const inFiles = readdirSync(casesDir).filter((f) => f.endsWith('.in')).sort()
if (inFiles.length === 0) {
  console.warn(`No .in cases for ${qid} — nothing to verify.`)
  process.exit(0)
}

let ok = 0
let bad = 0
for (const fname of inFiles) {
  const stem = fname.slice(0, -'.in'.length)
  const inPath = join(casesDir, fname)
  const outPath = join(casesDir, `${stem}.out`)
  if (!existsSync(outPath)) {
    console.error(`  ${stem}: missing .out`)
    bad++
    continue
  }
  const expected = readFileSync(outPath, 'utf8')
  const stdin = readFileSync(inPath, 'utf8')
  const r = spawnSync(refBin, [], { input: stdin, encoding: 'utf8', timeout: meta.timeLimitMs * 3 })
  if (r.status !== 0 && r.signal !== null) {
    console.error(`  ${stem}: reference signal ${r.signal}`)
    bad++
    continue
  }
  if (r.status !== 0) {
    console.error(`  ${stem}: reference exit code ${r.status}`)
    bad++
    continue
  }
  if (!judge(expected, r.stdout, mode)) {
    console.error(`  ${stem}: MISMATCH`)
    console.error(`    expected:\n${expected}`)
    console.error(`    actual:\n${r.stdout}`)
    bad++
    continue
  }
  ok++
  console.log(`  ${stem}: OK`)
}

console.log(`\n${qid}: ok=${ok}, bad=${bad}`)
process.exit(bad === 0 ? 0 : 1)
