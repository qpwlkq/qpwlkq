/**
 * Cordis plugin: the `/token-heatmap` command renders this machine's token
 * usage into `$DSH_HOME/token-heatmap/`.
 * @module token-heatmap/plugin
 */

import { join } from 'node:path'
import { resolveHome } from './paths.js'
import { collectUsage, writeOutputs } from './render.js'

/** Cordis plugin name. */
export const name = 'token-heatmap'

/**
 * Register the command when a command registry is composed.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'token-heatmap',
      description: 'Render a GitHub-style heatmap of local AI token usage',
      handler: async () => {
        try {
          const { home } = resolveHome()
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
          const out = join(home, 'token-heatmap')
          const collected = collectUsage({ home, timeZone })
          const written = writeOutputs({
            out,
            usage: collected.usage,
            grid: collected.grid,
            diagnostics: collected.diagnostics,
            timeZone,
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
