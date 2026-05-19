#!/usr/bin/env tsx
/**
 * Production LLM script — generalizes the Phase 5 smoke-llm.ts.
 *
 * Reads .env at repo root (or process.env in CI), calls the configured chat-
 * completions endpoint with a structured-output prompt asking for
 * { constraints_md, generator_cpp, validator_cpp }, writes them to
 * data/questions/<id>/generators/.
 *
 * Run locally:
 *   cd tools && pnpm exec tsx llm-emit-generator.ts --question-id b056-two-sum
 *
 * Run in CI: register-new-question.yml passes LLM_BASE_URL / LLM_API_KEY /
 * LLM_MODEL as env vars via repo secrets+vars.
 *
 * Exits 0 on success, 1 on any failure.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { config as dotenvConfig } from 'dotenv'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const QUESTIONS_DIR = join(REPO_ROOT, 'data', 'questions')

dotenvConfig({ path: join(REPO_ROOT, '.env') })

const { values } = parseArgs({
  options: {
    'question-id': { type: 'string' },
  },
  strict: true,
})

const qid = values['question-id']
if (!qid) {
  console.error('Usage: llm-emit-generator.ts --question-id <id>')
  process.exit(1)
}

const qDir = join(QUESTIONS_DIR, qid)
if (!existsSync(qDir)) {
  console.error(`Question dir not found: ${qDir}`)
  process.exit(1)
}

const LLM_BASE_URL = process.env.LLM_BASE_URL
const LLM_API_KEY = process.env.LLM_API_KEY
const LLM_MODEL = process.env.LLM_MODEL

if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
  console.error('Missing LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in env (or .env)')
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const statement = readFileSync(join(qDir, 'statement.md'), 'utf8')

const systemPrompt = `You are a competitive-programming problem analyst.

Given a problem statement and metadata, produce three artifacts as JSON:

1. constraints_md: a short markdown summary of the input constraints (variable ranges, edge cases). 5-15 lines.

2. generator_cpp: a complete C++17 program that takes a single command-line integer "seed" and prints a random valid input conforming to the constraints to stdout. Use <random> with mt19937 seeded by the argv seed for determinism. Cover edge cases (smallest, largest, boundary) by scaling input size with seed % small_int. Output ONLY the program input — no commentary.

3. validator_cpp: a complete C++17 program that reads an input from stdin, asserts it matches the stated constraints, exits 0 if valid, non-zero otherwise. Use cstdlib's exit(1) for invalid. Print to stderr the reason for rejection.

Both programs must compile cleanly with: g++ -O2 -std=c++17 file.cpp -o out.exe

Respond with a JSON object: { "constraints_md": string, "generator_cpp": string, "validator_cpp": string }. No additional fields. No commentary outside the JSON.`

const userPrompt = `# ${meta.title}
GPE ${meta.gpeYear} 場次 ${meta.gpeSession}, 題號 ${meta.gpeNo}
Time limit: ${meta.timeLimitMs} ms
Memory limit: ${meta.memLimitMb} MB

## Problem statement

${statement}`

const url = LLM_BASE_URL.replace(/\/$/, '') + '/chat/completions'
const body = {
  model: LLM_MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  response_format: { type: 'json_object' },
  temperature: 0.2,
}

console.log(`POST ${url}  (model=${LLM_MODEL})`)
const t0 = Date.now()
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${LLM_API_KEY}`,
  },
  body: JSON.stringify(body),
})
console.log(`HTTP ${res.status} in ${Date.now() - t0} ms`)

if (!res.ok) {
  console.error(await res.text())
  process.exit(1)
}

const json = (await res.json()) as {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}
const content = json?.choices?.[0]?.message?.content
if (!content) {
  console.error('No content in response. Raw:', JSON.stringify(json, null, 2))
  process.exit(1)
}

let parsed: { constraints_md: string; generator_cpp: string; validator_cpp: string }
try {
  parsed = JSON.parse(content)
} catch (e) {
  console.error('Failed to parse content as JSON:', (e as Error).message)
  console.error('Content:\n', content)
  process.exit(1)
}

for (const k of ['constraints_md', 'generator_cpp', 'validator_cpp'] as const) {
  if (typeof parsed[k] !== 'string' || !parsed[k]) {
    console.error(`Missing or empty field: ${k}`)
    process.exit(1)
  }
}

const outDir = join(qDir, 'generators')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'generator.cpp'), parsed.generator_cpp + '\n', 'utf8')
writeFileSync(join(outDir, 'validator.cpp'), parsed.validator_cpp + '\n', 'utf8')
writeFileSync(join(outDir, 'constraints.md'), parsed.constraints_md + '\n', 'utf8')

console.log(`Wrote ${outDir}/`)
if (json.usage) {
  console.log(`Tokens: prompt=${json.usage.prompt_tokens}, completion=${json.usage.completion_tokens}, total=${json.usage.total_tokens}`)
}
