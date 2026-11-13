/**
 * Collect, aggregate, and render token-usage heatmaps.
 * @module token-heatmap/render
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatTokens } from './format.js'
import { buildGrid } from './heatmap.js'
import { listSessionFiles, loadSessions } from './sessions.js'
import { renderSvg } from './svg.js'
import { dayKey, foldUsage } from './usage.js'

const DAY_MS = 86_400_000
const JSON_VERSION = 1

/**
 * Read every readable session log and fold its usage into daily totals.
 * @param options - home, time zone, window length, and optional end day.
 * @returns usage days, the calendar grid, and scan diagnostics.
 */
export function collectUsage({ home, timeZone, weeks = 53, end }) {
  const endDay = end ?? dayKey(Date.now(), timeZone)
  const sinceMs = Date.now() - (weeks * 7 + 7) * DAY_MS
  const files = listSessionFiles(home, { sinceMs })
  const loaded = loadSessions(files)
  const usage = foldUsage(loaded.sessions, { timeZone })
  const grid = buildGrid(
    new Map(usage.days.map(day => [day.date, day.totalTokens])),
    { end: endDay, weeks },
  )
  return {
    usage,
    grid,
    home,
    timeZone,
    diagnostics: {
      files: files.length,
      sessions: loaded.sessions.length,
      skippedFrames: loaded.skippedFrames,
      corruptLines: loaded.corruptLines,
    },
  }
}

/**
 * Write the usage ledger and both theme variants of the heatmap.
 * @param options - output directory, collected usage, grid, labels, and input metadata.
 * @returns written file paths.
 */
export function writeOutputs({ out, usage, grid, timeZone, home, diagnostics, title, writeLedger = true }) {
  mkdirSync(out, { recursive: true })
  const jsonPath = join(out, 'token-usage.json')
  const lightPath = join(out, 'token-heatmap.svg')
  const darkPath = join(out, 'token-heatmap-dark.svg')

  const headline = title ?? `${formatTokens(grid.stats.totalTokens)} AI tokens in the last year`
  const note = `${grid.stats.activeDays} active days · peak ${formatTokens(grid.stats.peak)}/day · updated ${grid.end}`

  if (writeLedger) {
    const snapshot = {
      version: JSON_VERSION,
      generatedAt: previousStamp(jsonPath, usage),
      timeZone,
      window: { start: grid.start, end: grid.end, weeks: grid.columns },
      title: headline,
      totals: usage.totals,
      sessionsWithUsage: usage.sessionsWithUsage,
      days: usage.days,
      diagnostics,
    }
    writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  }
  writeFileSync(lightPath, `${renderSvg(grid, { theme: 'light', title: headline, note })}\n`)
  writeFileSync(darkPath, `${renderSvg(grid, { theme: 'dark', title: headline, note })}\n`)

  return { jsonPath: writeLedger ? jsonPath : undefined, lightPath, darkPath, headline }
}

/**
 * Re-render from a previously exported ledger, without reading any session log.
 * @param json - parsed `token-usage.json`.
 * @param overrides - optional end day, week count, and title.
 * @returns usage, grid, and labels ready for {@link writeOutputs}.
 */
export function fromLedger(json, { end, weeks = 53, title } = {}) {
  if (!Array.isArray(json.days)) throw new Error('token-usage.json has no days array')
  const timeZone = json.timeZone ?? 'UTC'
  const endDay = end ?? json.window?.end ?? dayKey(Date.now(), timeZone)
  const dayTotals = new Map(json.days.map(day => [day.date, day.totalTokens ?? 0]))
  const grid = buildGrid(dayTotals, { end: endDay, weeks })
  const totals = json.totals ?? { totalTokens: 0 }
  const usage = {
    days: json.days,
    totals,
    sessionsWithUsage: json.sessionsWithUsage ?? 0,
  }
  const headline = title ?? json.title ?? `${formatTokens(grid.stats.totalTokens)} AI tokens in the last year`
  return { usage, grid, timeZone, headline, home: json.home, diagnostics: json.diagnostics }
}

/**
 * Keep the previous timestamp when the ledger content is unchanged, so a
 * scheduled sync does not create a commit per run.
 * @param path - destination ledger path.
 * @param usage - freshly folded usage.
 * @returns an ISO timestamp.
 */
function previousStamp(path, usage) {
  try {
    const previous = JSON.parse(readFileSync(path, 'utf8'))
    if (previous.version === JSON_VERSION
      && JSON.stringify(previous.days) === JSON.stringify(usage.days)
      && JSON.stringify(previous.totals) === JSON.stringify(usage.totals)) {
      return previous.generatedAt
    }
  } catch {
    // Missing or malformed previous ledger: write a fresh timestamp.
  }
  return new Date().toISOString()
}
