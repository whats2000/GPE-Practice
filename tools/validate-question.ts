#!/usr/bin/env tsx
/**
 * CLI: validate one or more question directories against the shared schema.
 * Usage: tsx validate-question.ts [question-id ...]
 * If no ids given, validates ALL questions under data/questions/.
 * Exits 0 if all valid, 1 otherwise.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

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

function listAll(): string[] {
  if (!existsSync(QUESTIONS_DIR)) return []
  return readdirSync(QUESTIONS_DIR)
    .filter((entry) => statSync(join(QUESTIONS_DIR, entry)).isDirectory())
    .sort()
}

function validateOne(id: string): boolean {
  const dir = join(QUESTIONS_DIR, id)
  if (!existsSync(dir)) {
    console.error(`✘ ${id}: directory not found`)
    return false
  }
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) {
    console.error(`✘ ${id}: missing meta.json`)
    return false
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(metaPath, 'utf8'))
  } catch (e) {
    console.error(`✘ ${id}: meta.json is not valid JSON — ${(e as Error).message}`)
    return false
  }
  const result = QuestionMetaSchema.safeParse(raw)
  if (!result.success) {
    console.error(`✘ ${id}: schema validation failed`)
    for (const issue of result.error.issues) {
      console.error(`    - ${issue.path.join('.')}: ${issue.message}`)
    }
    return false
  }
  if (result.data.id !== id) {
    console.error(`✘ ${id}: meta.json id field "${result.data.id}" does not match folder name`)
    return false
  }
  console.log(`✔ ${id}`)
  return true
}

const args = process.argv.slice(2)
const ids = args.length > 0 ? args : listAll()
let ok = true
for (const id of ids) {
  if (!validateOne(id)) ok = false
}
process.exit(ok ? 0 : 1)
