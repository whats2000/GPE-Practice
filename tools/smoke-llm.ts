#!/usr/bin/env tsx
/**
 * One-off smoke test for the LLM client.
 *
 * Reads .env at repo root, calls the configured chat-completions endpoint
 * with a structured-output prompt asking for { generator_cpp, validator_cpp,
 * constraints_md } against an existing seed question, and writes the result
 * to tools/.smoke-llm-output/<qid>/ for human inspection.
 *
 * Phase 6 will formalize this into `tools/llm-emit-generator.ts`. For now we
 * just want to verify:
 *   1. The .env wiring works.
 *   2. The Gemini OpenAI-compat endpoint accepts our payload.
 *   3. The response is parseable JSON.
 *   4. The generator/validator code looks vaguely sensible.
 *
 * Run:
 *   cd tools && pnpm exec tsx smoke-llm.ts [question-id]
 *
 * Defaults to question-id = b056-two-sum.
 *
 * Outputs:
 *   tools/.smoke-llm-output/<qid>/{generator.cpp, validator.cpp, constraints.md, raw.json}
 *
 * Cost: one Gemini chat-completions call. With gemini-3.1-flash-lite, ~free tier.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Minimal .env parser — avoids adding `dotenv` as a dep just for the smoke test.
// ---------------------------------------------------------------------------
function loadDotenv(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf8')
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // Strip optional surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const env = loadDotenv(join(REPO_ROOT, '.env'))
const LLM_BASE_URL = env.LLM_BASE_URL ?? process.env.LLM_BASE_URL
const LLM_API_KEY = env.LLM_API_KEY ?? process.env.LLM_API_KEY
const LLM_MODEL = env.LLM_MODEL ?? process.env.LLM_MODEL

if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
  console.error('Missing one of LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in .env')
  process.exit(1)
}
// Don't print the key. Print the rest for sanity.
console.log(`LLM_BASE_URL = ${LLM_BASE_URL}`)
console.log(`LLM_MODEL    = ${LLM_MODEL}`)
console.log(`LLM_API_KEY  = ${LLM_API_KEY.slice(0, 4)}…${LLM_API_KEY.slice(-4)} (${LLM_API_KEY.length} chars)`)

// ---------------------------------------------------------------------------
// Question loader
// ---------------------------------------------------------------------------
const qid = process.argv[2] ?? 'b056-two-sum'
const qDir = join(REPO_ROOT, 'data', 'questions', qid)
if (!existsSync(qDir)) {
  console.error(`Question dir not found: ${qDir}`)
  process.exit(1)
}
const meta = JSON.parse(readFileSync(join(qDir, 'meta.json'), 'utf8'))
const statement = readFileSync(join(qDir, 'statement.md'), 'utf8')

console.log(`\nSmoke-testing on question: ${qid} (${meta.title})`)

// ---------------------------------------------------------------------------
// Prompt — structured JSON output via `response_format: json_object`
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Call
// ---------------------------------------------------------------------------
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

console.log(`\nPOST ${url}`)
const t0 = Date.now()
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${LLM_API_KEY}`,
  },
  body: JSON.stringify(body),
})
const ms = Date.now() - t0
console.log(`HTTP ${res.status} in ${ms} ms`)

if (!res.ok) {
  const errBody = await res.text()
  console.error('Error body:', errBody)
  process.exit(1)
}

const json: any = await res.json()
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
  console.error('Content was:\n', content)
  process.exit(1)
}

const required = ['constraints_md', 'generator_cpp', 'validator_cpp'] as const
for (const k of required) {
  if (typeof parsed[k] !== 'string' || !parsed[k]) {
    console.error(`Missing or empty field: ${k}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Save output
// ---------------------------------------------------------------------------
const outDir = join(__dirname, '.smoke-llm-output', qid)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'generator.cpp'), parsed.generator_cpp + '\n', 'utf8')
writeFileSync(join(outDir, 'validator.cpp'), parsed.validator_cpp + '\n', 'utf8')
writeFileSync(join(outDir, 'constraints.md'), parsed.constraints_md + '\n', 'utf8')
writeFileSync(join(outDir, 'raw.json'), JSON.stringify(json, null, 2) + '\n', 'utf8')

console.log(`\nWrote to ${outDir}:`)
console.log(`  generator.cpp  (${parsed.generator_cpp.length} chars)`)
console.log(`  validator.cpp  (${parsed.validator_cpp.length} chars)`)
console.log(`  constraints.md (${parsed.constraints_md.length} chars)`)
console.log(`  raw.json       (full API response)`)

// Token usage if reported
if (json.usage) {
  console.log(`\nTokens: prompt=${json.usage.prompt_tokens}, completion=${json.usage.completion_tokens}, total=${json.usage.total_tokens}`)
}
