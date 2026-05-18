#!/usr/bin/env tsx
/**
 * Download the pre-built emception artifacts from jprendes.github.io into
 * app/public/emception/ so the SPA can self-host them (avoids cross-origin
 * Worker + COOP/COEP issues).
 *
 * Runs locally and in CI before `pnpm build`. The result is gitignored;
 * re-running this script is the canonical refresh path.
 *
 * Source manifest: see spike/wasm-toolchain/emception/MANIFEST.md.
 */
import { writeFile, mkdir, stat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const OUT_DIR = join(REPO_ROOT, 'app', 'public', 'emception')
const MANIFEST_PATH = join(REPO_ROOT, 'spike', 'wasm-toolchain', 'emception', 'MANIFEST.md')

const BASE = 'https://jprendes.github.io/emception'
const COMLINK_URL = 'https://unpkg.com/comlink@4.4.1/dist/esm/comlink.mjs'

// "Main" emception artifacts that aren't sysroot .a libs.
// These are referenced by NAME in the worker bundle's webpack-loader map.
// If any are wrong, the worker will 404 at runtime.
// Verify against the spike's MANIFEST.md before changing.
const NON_LIB_ARTIFACTS = [
  'emception.worker.bundle.worker.js',
  'cecdfcda360457a8f204.br',          // root.pack.br
  'f0283badd42fe745cbe4.wasm',        // wasm-package
  '9d1e542b80004e27297f.wasm',        // brotli decompressor
  '94c22103400127179679.a',           // libGL.a
  '5de9254458072f582a9c.a',           // libhtml5.a
]

interface DownloadResult {
  filename: string
  size: number
  cached: boolean
}

async function downloadOne(url: string, dest: string): Promise<DownloadResult> {
  const filename = dest.split(/[\\/]/).pop()!
  if (existsSync(dest)) {
    const s = await stat(dest)
    if (s.size > 0) return { filename, size: s.size, cached: true }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch ${url} → HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return { filename, size: buf.byteLength, cached: false }
}

/**
 * Pull the list of sysroot .a hashed filenames from the spike MANIFEST.md.
 * The manifest contains lines like:  | `94c22103400127179679.a` | libGL.a | ...
 * or similar — we just grep for the .a pattern and dedupe.
 */
async function readSpikeManifestLibs(): Promise<string[]> {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Cannot find ${MANIFEST_PATH} — was Phase 0 spike committed?`)
  }
  const md = await readFile(MANIFEST_PATH, 'utf8')
  // Match 20-character hex names with .a extension (webpack hash format)
  const matches = md.match(/[a-f0-9]{20}\.a/g) ?? []
  return Array.from(new Set(matches))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  let totalBytes = 0
  let downloaded = 0
  let cached = 0

  console.log('Downloading Comlink…')
  const r = await downloadOne(COMLINK_URL, join(OUT_DIR, 'comlink.mjs'))
  totalBytes += r.size
  if (r.cached) cached++; else downloaded++
  console.log(`  ${r.filename}  ${r.size} bytes${r.cached ? ' (cached)' : ''}`)

  console.log('\nDownloading emception worker + tool wasms + GL/html5 libs…')
  for (const name of NON_LIB_ARTIFACTS) {
    const res = await downloadOne(`${BASE}/${name}`, join(OUT_DIR, name))
    totalBytes += res.size
    if (res.cached) cached++; else downloaded++
    console.log(`  ${res.filename}  ${res.size} bytes${res.cached ? ' (cached)' : ''}`)
  }

  console.log('\nReading sysroot lib hashes from spike MANIFEST.md…')
  const libs = await readSpikeManifestLibs()
  // Remove libs already covered by NON_LIB_ARTIFACTS to avoid double-counting
  const additionalLibs = libs.filter((l) => !NON_LIB_ARTIFACTS.includes(l))
  console.log(`Found ${libs.length} total .a refs, ${additionalLibs.length} additional sysroot libs`)
  if (additionalLibs.length < 40) {
    throw new Error(
      `Found only ${additionalLibs.length} additional sysroot libs; expected ~44. ` +
        `Check the MANIFEST.md format and adjust the regex in readSpikeManifestLibs().`,
    )
  }

  console.log('\nDownloading sysroot .a libs…')
  for (const lib of additionalLibs) {
    const res = await downloadOne(`${BASE}/${lib}`, join(OUT_DIR, lib))
    totalBytes += res.size
    if (res.cached) cached++; else downloaded++
    // Quieter output for the bulk lib downloads
    if (!res.cached) console.log(`  ${res.filename}  ${res.size} bytes`)
  }

  const totalMb = (totalBytes / 1024 / 1024).toFixed(1)
  console.log(`\nDone. ${downloaded} downloaded, ${cached} already cached. Total ${totalMb} MB in ${OUT_DIR}`)
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
