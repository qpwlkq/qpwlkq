/**
 * Resolve plugin configuration with explicit defaults.
 *
 * The plugin is also loadable by absolute path, where no `node_modules` sits
 * beside it, so it declares no schema dependency and validates here instead.
 * @module token-heatmap/config
 */

import { join } from 'node:path'

/** Default number of week columns: one GitHub-style year. */
export const DEFAULT_WEEKS = 53

/**
 * Resolve raw plugin config into the settings the renderer consumes.
 * @param raw - config object from the loader, possibly empty or undefined.
 * @param options - resolved DSH home, used for the default output directory.
 * @returns output directory, IANA time zone, and week count.
 */
export function resolveConfig(raw, { home }) {
  const config = raw ?? {}

  const weeks = config.weeks ?? DEFAULT_WEEKS
  if (!Number.isInteger(weeks) || weeks < 4 || weeks > 104) {
    throw new Error(`weeks must be an integer between 4 and 104, got ${String(config.weeks)}`)
  }

  const timeZone = config.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
  } catch {
    throw new Error(`invalid timeZone "${timeZone}"`)
  }

  const outputDir = config.outputDir || join(home, 'token-heatmap')

  return { outputDir, timeZone, weeks }
}
