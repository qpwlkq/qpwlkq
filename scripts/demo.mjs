/**
 * Generate the storefront screenshot from deterministic synthetic data.
 *
 * The committed PNG is rendered from this script's SVG output:
 *   node scripts/demo.mjs
 *   rsvg-convert -w 1600 assets/screenshot-1.svg -o assets/screenshot-1.png
 * @module token-heatmap/scripts/demo
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatTokens } from '../src/format.js'
import { buildGrid } from '../src/heatmap.js'
import { renderSvg } from '../src/svg.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const END = '2026-11-13'
const END_MS = Date.UTC(2026, 10, 13)
const DAY_MS = 86_400_000
const DAYS = 365

/**
 * FNV-1a: stable pseudo-random weight per date, so the screenshot is
 * reproducible without committing a fixture file.
 * @param text - date key.
 * @returns a value in [0, 1).
 */
function hash(text) {
  let value = 2166136261
  for (const character of text) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0) / 4294967296
}

const days = new Map()
for (let offset = 0; offset < DAYS; offset += 1) {
  const time = END_MS - offset * DAY_MS
  const date = new Date(time)
  const key = date.toISOString().slice(0, 10)
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
  const roll = hash(key)
  if (roll < 0.16) continue
  const tokens = Math.round((0.15 + hash(`${key}:volume`) * 1.6) * (weekend ? 0.25 : 1) * 1_000_000)
  if (tokens > 0) days.set(key, tokens)
}

const grid = buildGrid(days, { end: END, weeks: 53 })
const title = `${formatTokens(grid.stats.totalTokens)} AI tokens in the last year`
const note = `${grid.stats.activeDays} active days · peak ${formatTokens(grid.stats.peak)}/day · updated ${grid.end}`

mkdirSync(join(ROOT, 'assets'), { recursive: true })
for (const theme of ['light', 'dark']) {
  const path = join(ROOT, 'assets', `screenshot-1-${theme}.svg`)
  writeFileSync(path, `${renderSvg(grid, { theme, title, note })}\n`)
  process.stdout.write(`wrote ${path}\n`)
}
