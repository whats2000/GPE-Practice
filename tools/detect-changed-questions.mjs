#!/usr/bin/env node
/**
 * Reads stdin (newline-separated file paths from `git diff --name-only`),
 * extracts unique question ids touched under `data/questions/<id>/...`,
 * prints one id per line on stdout.
 *
 * Used by validate-pr.yml to find which questions to verify.
 */
import { readFileSync } from 'node:fs'

const text = readFileSync(0, 'utf8')
const ids = new Set()
for (const line of text.split(/\r?\n/)) {
  const m = line.trim().match(/^data\/questions\/([^/]+)\//)
  if (m) ids.add(m[1])
}
for (const id of Array.from(ids).sort()) console.log(id)
