#!/usr/bin/env tsx
/**
 * For each seed in meta.json.generatedSeeds:
 *   compile generator.cpp + validator.cpp + reference.cpp natively,
 *   run gen → val → (if valid) ref,
 *   write cases/generated-<seed>.in / .out.
 *
 * Run locally:
 *   cd tools && pnpm exec tsx run-generator-and-reference.ts --question-id b056-two-sum
 *
 * Run in CI: register-new-question.yml + regenerate-cases.yml both call this.
 *
 * Exits 0 on success (even if some seeds were rejected by validator);
 * exits 1 only on compile failures or filesystem errors.
 * If reference.cpp is the empty template, exits 0 and prints a warning;
 * generators are still produced so reviewers can inspect them.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

const { values } = parseArgs({
  options: { 'question-id': { type: 'string' } },
  strict: true,
})

const qid = values['question-id']
if (!qid) {
  console.error('Usage: run-generator-and-reference.ts --question-id <id>')
  process.exit(1)
}

const qDir = join(QUESTIONS_DIR, qid)
if (!existsSync(qDir)) {
  console.error(`Question dir not found: ${qDir}`)
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const seeds: { seed: number; label: string }[] = meta.generatedSeeds ?? []
if (seeds.length === 0) {
  console.log(`No generatedSeeds for ${qid} — nothing to do.`)
  process.exit(0)
}

const genSrc = join(qDir, 'generators', 'generator.cpp')
const valSrc = join(qDir, 'generators', 'validator.cpp')
const refSrc = join(qDir, 'solutions', 'reference.cpp')
for (const f of [genSrc, valSrc, refSrc]) {
  if (!existsSync(f)) {
    console.error(`Missing: ${f}`)
    process.exit(1)
  }
}

const refText = readFileSync(refSrc, 'utf8')
const refIsTemplate = refText.length < 200 && refText.includes('// TODO')

function gxx(src: string, out: string): void {
  const r = spawnSync('g++', ['-O2', '-std=c++17', src, '-o', out], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`g++ failed for ${src}:\n${r.stderr}`)
    process.exit(1)
  }
}

const tmp = tmpdir()
const genBin = join(tmp, `gen_${qid}.exe`)
const valBin = join(tmp, `val_${qid}.exe`)
const refBin = join(tmp, `ref_${qid}.exe`)

console.log('Compiling generator.cpp...')
gxx(genSrc, genBin)
console.log('Compiling validator.cpp...')
gxx(valSrc, valBin)

if (refIsTemplate) {
  console.warn('reference.cpp is the empty template — skipping case generation.')
  console.warn('Generator + validator are committed; reviewer should populate reference.cpp,')
  console.warn('then rerun this script (or regenerate-cases.yml) to produce cases.')
  process.exit(0)
}

console.log('Compiling reference.cpp...')
gxx(refSrc, refBin)

const casesDir = join(qDir, 'cases')
mkdirSync(casesDir, { recursive: true })

let kept = 0
let rejected = 0
for (const { seed, label } of seeds) {
  const inPath = join(casesDir, `generated-${String(seed).padStart(3, '0')}.in`)
  const outPath = join(casesDir, `generated-${String(seed).padStart(3, '0')}.out`)
  const gen = spawnSync(genBin, [String(seed)], { encoding: 'utf8' })
  if (gen.status !== 0) {
    console.warn(`  seed ${seed} (${label}): generator failed — skipped`)
    rejected++
    continue
  }
  const val = spawnSync(valBin, [], { input: gen.stdout, encoding: 'utf8' })
  if (val.status !== 0) {
    console.warn(`  seed ${seed} (${label}): validator rejected — skipped: ${val.stderr.trim()}`)
    rejected++
    continue
  }
  const ref = spawnSync(refBin, [], { input: gen.stdout, encoding: 'utf8' })
  if (ref.status !== 0) {
    console.warn(`  seed ${seed} (${label}): reference crashed — skipped: ${ref.stderr.trim()}`)
    rejected++
    continue
  }
  writeFileSync(inPath, gen.stdout, 'utf8')
  writeFileSync(outPath, ref.stdout, 'utf8')
  console.log(`  seed ${seed} (${label}): kept (in=${gen.stdout.length}b, out=${ref.stdout.length}b)`)
  kept++
}

console.log(`\nDone. kept=${kept}, rejected=${rejected}`)
