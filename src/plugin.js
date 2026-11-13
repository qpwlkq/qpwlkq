/**
 * Cordis plugin: the `/token-heatmap` command renders this machine's token
 * usage into the configured output directory (default `$DSH_HOME/token-heatmap`).
 *
 * The command prefers `ctx.sessionQuery`, which is persistence-independent,
 * and falls back to the durable JSONL logs when that seam is not composed.
 * @module token-heatmap/plugin
 */

import { resolveConfig } from './config.js'
import { resolveHome } from './paths.js'
import { readSessionsFromQuery } from './query.js'
import { collectUsage, collectUsageFromSessions, writeOutputs } from './render.js'

/** Cordis plugin name. */
export const name = 'token-heatmap'

/**
 * Register the command when a command registry is composed.
 * @param ctx - plugin context.
 * @param config - optional `outputDir`, `timeZone`, and `weeks`.
 */
export function apply(ctx, config) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'token-heatmap',
      description: 'Render a GitHub-style heatmap of local AI token usage',
      handler: async () => {
        try {
          const { home } = resolveHome()
          const settings = resolveConfig(config, { home })
          const collected = await collectFor(ctx, home, settings)
          const written = writeOutputs({
            out: settings.outputDir,
            usage: collected.usage,
            grid: collected.grid,
            diagnostics: collected.diagnostics,
            timeZone: settings.timeZone,
            home,
          })
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
