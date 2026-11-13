/**
 * Cordis plugin: the `/token-heatmap` command renders this machine's token
 * usage into the configured output directory (default `$DSH_HOME/token-heatmap`).
 *
 * The command prefers `ctx.sessionQuery`, which is persistence-independent,
 * and falls back to the durable JSONL logs when that seam is not composed.
 * With `autoUpdate` enabled the same render also runs shortly after load and
 * then on a fixed interval, so the preview stays current without a command.
 * @module token-heatmap/plugin
 */

import { resolveConfig } from './config.js'
import { resolveHome } from './paths.js'
import { readSessionsFromQuery } from './query.js'
import { collectUsage, collectUsageFromSessions, writeOutputs } from './render.js'

/** Cordis plugin name. */
export const name = 'token-heatmap'

/** Wait for the host to settle before the first automatic render. */
const STARTUP_DELAY_MS = 5_000

/**
 * Register the command when a command registry is composed.
 * @param ctx - plugin context.
 * @param config - optional `outputDir`, `timeZone`, `weeks`, and auto-update settings.
 */
export function apply(ctx, config) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'token-heatmap',
      description: 'Render a GitHub-style heatmap of local AI token usage',
      handler: async () => {
        try {
          const written = await renderOnce(ctx, resolveSettings(config))
          return {
            kind: 'success',
            text: `${written.headline} · ${written.lightPath}`,
          }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })
  })

  if (config?.autoUpdate === true) scheduleAutoUpdate(ctx, config)
}

/**
 * Resolve config against the current home.
 * @param config - raw plugin config.
 * @returns resolved settings.
 */
function resolveSettings(config) {
  return resolveConfig(config, { home: resolveHome().home })
}

/**
 * Render once into the configured output directory.
 * @param ctx - plugin context.
 * @param settings - resolved plugin config.
 * @returns written file paths and the headline.
 */
async function renderOnce(ctx, settings) {
  const collected = await collectFor(ctx, settings.home, settings)
  return writeOutputs({
    out: settings.outputDir,
    usage: collected.usage,
    grid: collected.grid,
    diagnostics: collected.diagnostics,
    timeZone: settings.timeZone,
    home: settings.home,
  })
}

/**
 * Render shortly after load, then every configured number of hours.
 *
 * A failed pass stays silent and the next tick retries: the command is where
 * a user asks for a diagnosis. Output files whose bytes did not change are
 * left untouched, so an idle interval does not rewrite the preview.
 * @param ctx - plugin context.
 * @param config - raw plugin config with `autoUpdate` enabled.
 */
function scheduleAutoUpdate(ctx, config) {
  let timer
  let settings
  try {
    settings = resolveSettings(config)
  } catch {
    // An invalid config must not stop the plugin from loading; the command
    // reports the same error when invoked.
    return
  }

  const tick = () => {
    renderOnce(ctx, settings)
      .catch(() => {
        // Retried on the next interval.
      })
      .finally(() => {
        timer = setTimeout(tick, settings.autoUpdateIntervalHours * 3_600_000)
        timer.unref?.()
      })
  }

  timer = setTimeout(tick, STARTUP_DELAY_MS)
  timer.unref?.()
  ctx.effect(() => () => clearTimeout(timer), 'token-heatmap.autoUpdate()')
}

/**
 * Prefer the query seam, fall back to the durable JSONL logs.
 * @param ctx - plugin context.
 * @param home - resolved DSH home.
 * @param settings - resolved plugin config.
 * @returns collected usage with its diagnostics.
 */
async function collectFor(ctx, home, settings) {
  const query = typeof ctx.get === 'function' ? ctx.get('sessionQuery', false) : undefined
  if (query !== undefined && query !== null) {
    try {
      const sessions = await readSessionsFromQuery(query)
      return {
        ...collectUsageFromSessions(sessions, {
          timeZone: settings.timeZone,
          weeks: settings.weeks,
          source: 'sessionQuery',
        }),
        home,
      }
    } catch {
      // A failing query backend must not take the command down; the durable
      // logs stay readable, and the fallback reports its own source.
    }
  }
  return collectUsage({ home, timeZone: settings.timeZone, weeks: settings.weeks })
}
