#!/usr/bin/env tsx
/**
 * Walk data/questions/<slug>/meta.json, validate against the shared zod schema,
 * compute the build-time portion of the recommendation score, emit a typed
 * manifest module at app/src/data/manifest.gen.ts.
 *
 * Run with:  pnpm --filter gpe-practice-tools build-manifest
 * Or from app/ via `pnpm prebuild` (wired in app/package.json).
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')
const OUT_FILE = join(REPO_ROOT, 'app', 'src', 'data', 'manifest.gen.ts')
const APP_PUBLIC_DATA = join(REPO_ROOT, 'app', 'public', 'data', 'questions')

const JudgeModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('exact') }),
  z.object({ mode: z.literal('whitespace') }),
  z.object({ mode: z.literal('float'), eps: z.number().positive() }),
])

const QuestionMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  gpeYear: z.number().int().min(2000).max(2100),
  gpeSession: z.number().int().min(1).max(12),
  gpeNo: z.string().min(1),
  uvaId: z.number().int().positive().nullable(),
  uvaName: z.string().min(1).nullable(),
  tags: z.array(z.string().min(1)),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  timeLimitMs: z.number().int().positive(),
  memLimitMb: z.number().int().positive(),
  judge: JudgeModeSchema,
  generatedSeeds: z.array(z.object({ seed: z.number().int().nonnegative(), label: z.string().min(1) })),
  stats: z.object({
    appearanceCount: z.number().int().nonnegative(),
    lastAppearedYear: z.number().int().min(2000).max(2100),
    acRate: z.number().min(0).max(1),
    recommendationScore: z.number().min(0).max(100),
  }),
})

type QuestionMeta = z.infer<typeof QuestionMetaSchema>

/**
 * Mirror of app/src/lib/recommendationScore.ts. Weights normalize to 1.0
 * so max buildScore is 90 (leaving 10 headroom for the client-side not-passed bonus).
 */
export function computeBuildTimeScore(
  stats: { appearanceCount: number; lastAppearedYear: number; acRate: number },
  maxAppearanceCount: number,
  currentYear: number,
): number {
  const freqWeight = 4 / 9
  const recencyWeight = 3 / 9
  const difficultyWeight = 2 / 9
  const freqNorm = maxAppearanceCount > 0 ? stats.appearanceCount / maxAppearanceCount : 0
  const yearGap = Math.max(0, Math.min(10, currentYear - stats.lastAppearedYear))
  const recencyNorm = 1 - yearGap / 10
  const difficultyNorm = Math.max(0, Math.min(1, 1 - stats.acRate))
  const raw =
    90 * (freqWeight * freqNorm + recencyWeight * recencyNorm + difficultyWeight * difficultyNorm)
  return Math.round(Math.max(0, Math.min(90, raw)) * 10) / 10
}

function listQuestionDirs(): string[] {
  if (!existsSync(QUESTIONS_DIR)) return []
  return readdirSync(QUESTIONS_DIR)
    .filter((entry) => statSync(join(QUESTIONS_DIR, entry)).isDirectory())
    .sort()
}

function loadMeta(dir: string): QuestionMeta {
  const file = join(QUESTIONS_DIR, dir, 'meta.json')
  if (!existsSync(file)) throw new Error(`Missing meta.json at ${relative(REPO_ROOT, file)}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const parsed = QuestionMetaSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Schema validation failed for ${dir}:\n${issues}`)
  }
  if (parsed.data.id !== dir) {
    throw new Error(`meta.json id "${parsed.data.id}" does not match folder name "${dir}"`)
  }
  return parsed.data
}

interface CaseRef {
  id: string
  visibility: 'sample' | 'generated' | 'community' | 'hidden'
}

function classifyCase(filename: string): CaseRef['visibility'] {
  if (filename.startsWith('sample-')) return 'sample'
  if (filename.startsWith('generated-')) return 'generated'
  if (filename.startsWith('community-')) return 'community'
  if (filename.startsWith('hidden-')) return 'hidden'
  return 'hidden'
}

function listCases(qid: string): CaseRef[] {
  const dir = join(QUESTIONS_DIR, qid, 'cases')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
  const inFiles = files.filter((f) => f.endsWith('.in'))
  return inFiles
    .map((f) => {
      const stem = f.slice(0, -'.in'.length)
      const outFile = `${stem}.out`
      if (!files.includes(outFile)) {
        throw new Error(`Case ${qid}/${stem} has .in but no .out`)
      }
      return { id: stem, visibility: classifyCase(stem) }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

function copyQuestionAssets(qid: string) {
  const srcDir = join(QUESTIONS_DIR, qid)
  const dstDir = join(APP_PUBLIC_DATA, qid)
  mkdirSync(join(dstDir, 'cases'), { recursive: true })
  const stmt = join(srcDir, 'statement.md')
  if (existsSync(stmt)) copyFileSync(stmt, join(dstDir, 'statement.md'))
  const casesSrc = join(srcDir, 'cases')
  if (existsSync(casesSrc)) {
    for (const f of readdirSync(casesSrc)) {
      if (f.endsWith('.in') || f.endsWith('.out')) {
        copyFileSync(join(casesSrc, f), join(dstDir, 'cases', f))
      }
    }
  }
}

function emitManifest(metas: QuestionMeta[], currentYear: number): string {
  const maxAppearance = metas.reduce((m, q) => Math.max(m, q.stats.appearanceCount), 0)
  const enriched = metas.map((m) => ({
    ...m,
    caseList: listCases(m.id),
    stats: {
      ...m.stats,
      recommendationScore: computeBuildTimeScore(m.stats, maxAppearance, currentYear),
    },
  }))

  return `// AUTO-GENERATED by tools/build-manifest.ts. Do not edit by hand.
// Regenerate via: pnpm --filter gpe-practice-tools build-manifest
// Or run \`pnpm prebuild\` from app/.

import type { QuestionManifestEntry } from './schema'

export const questions: readonly QuestionManifestEntry[] = ${JSON.stringify(enriched, null, 2)}

export const corpus = {
  totalQuestions: ${enriched.length},
  maxAppearanceCount: ${maxAppearance},
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  currentYearAssumed: ${currentYear},
} as const
`
}

function main() {
  const dirs = listQuestionDirs()
  const metas = dirs.map(loadMeta)
  for (const m of metas) copyQuestionAssets(m.id)
  const currentYear = new Date().getUTCFullYear()
  const out = emitManifest(metas, currentYear)
  mkdirSync(join(REPO_ROOT, 'app', 'src', 'data'), { recursive: true })
  writeFileSync(OUT_FILE, out, 'utf8')
  console.log(`Wrote ${relative(REPO_ROOT, OUT_FILE)} (${metas.length} questions)`)
  console.log(`Copied statements + cases to ${relative(REPO_ROOT, APP_PUBLIC_DATA)}`)
}

main()
