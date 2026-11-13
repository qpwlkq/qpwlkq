#!/usr/bin/env node
/**
 * Command line entry: scan DSH session logs and render the token heatmap.
 * @module token-heatmap/cli
 */

import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { formatExact, formatTokens } from './format.js'
import { resolveHome } from './paths.js'
import { collectUsage, fromLedger, writeOutputs } from './render.js'

const HELP = `dsh-token-heatmap — GitHub-style heatmap of DeepSeek Harness token usage

Usage
  dsh-token-heatmap [render] [options]   write token-usage.json + two SVGs
  dsh-token-heatmap stats  [options]     print the aggregate without writing
  dsh-token-heatmap render --from FILE   re-render an exported ledger (no session scan)

Options
  --home <dir>    DSH home holding sessions/ (default: $DSH_HOME, desktop install, ~/.dsh)
  --out <dir>     output directory (default: .)
  --from <file>   token-usage.json to render instead of scanning sessions
  --tz <zone>     IANA zone used to assign samples to days (default: system zone)
  --end <date>    last day of the window, YYYY-MM-DD (default: today)
  --weeks <n>     week columns (default: 53)
  --title <text>  headline override
  --quiet         only print written paths
  --help          show this help
`

/**
 * Run one CLI invocation.
 * @param argv - arguments after the executable name.
 * @returns process exit code.
 */
function main(argv) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      home: { type: 'string' },
      out: { type: 'string' },
      from: { type: 'string' },
      tz: { type: 'string' },
      end: { type: 'string' },
      weeks: { type: 'string' },
      title: { type: 'string' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    process.stdout.write(HELP)
    return 0
  }

  const command = positionals[0] ?? 'render'
  if (command !== 'render' && command !== 'stats') {
    throw new Error(`unknown command "${command}" (expected render or stats)`)
  }

  const timeZone = values.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const weeks = values.weeks === undefined ? 53 : Number(values.weeks)
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 200) {
    throw new Error('--weeks must be an integer between 1 and 200')
  }

  const result = values.from === undefined
    ? collectUsage({ home: resolveHome(values.home).home, timeZone, weeks, end: values.end })
    : (() => {
      const path = statSync(values.from).isDirectory() ? join(values.from, 'token-usage.json') : values.from
      const ledger = fromLedger(JSON.parse(readFileSync(path, 'utf8')), { end: values.end, weeks, title: values.title })
      return { usage: ledger.usage, grid: ledger.grid, diagnostics: ledger.diagnostics ?? {}, timeZone: ledger.timeZone, home: ledger.home, headline: ledger.headline }
    })()

  const { usage, grid } = result
  const summary = describe(result, timeZone)
  if (command === 'stats') {
    process.stdout.write(`${summary}\n`)
    return 0
  }

  const written = writeOutputs({
    out: resolve(values.out ?? '.'),
    usage,
    grid,
    timeZone: result.timeZone ?? timeZone,
    home: result.home,
    diagnostics: result.diagnostics,
    title: values.title ?? result.headline,
    writeLedger: values.from === undefined,
  })
  if (values.quiet) {
    process.stdout.write(`${written.lightPath}\n`)
    return 0
  }
  process.stdout.write(`${summary}\n\n`)
  if (written.jsonPath !== undefined) process.stdout.write(`wrote ${written.jsonPath}\n`)
  process.stdout.write(`wrote ${written.lightPath}\n`)
  process.stdout.write(`wrote ${written.darkPath}\n`)
  return 0
}

function describe({ usage, grid, diagnostics, home }, timeZone) {
  const { totals } = usage
  const lines = [
    `home      ${home ?? '(not recorded in ledger)'}`,
    `time zone ${timeZone}`,
    `window    ${grid.start} -> ${grid.end} (${grid.columns} weeks)`,
    diagnostics?.files === undefined
      ? 'logs      (rendered from ledger, no scan)'
      : `logs      ${diagnostics.files} files, ${diagnostics.sessions} sessions`
        + (diagnostics.skippedFrames ? `, ${diagnostics.skippedFrames} torn frames skipped` : '')
        + (diagnostics.corruptLines ? `, ${diagnostics.corruptLines} corrupt lines` : ''),
    `tokens    ${formatExact(totals.totalTokens)} (${formatTokens(totals.totalTokens)})`
      + `  in ${formatTokens(totals.uncachedInputTokens)}`
      + `  out ${formatTokens(totals.outputTokens)}`
      + `  cache read ${formatTokens(totals.cacheReadTokens)}`
      + `  cache write ${formatTokens(totals.cacheWriteTokens)}`,
    `requests  ${formatExact(totals.requests ?? 0)}`,
    `active    ${grid.stats.activeDays} days, peak ${formatTokens(grid.stats.peak)}/day`,
  ]
  return lines.join('\n')
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
