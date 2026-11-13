/**
 * Locate the DSH home whose `sessions/` tree holds the durable session logs.
 * @module token-heatmap/paths
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Resolve the harness home in the order an operator expects: an explicit
 * value, the running app's `$DSH_HOME`, the macOS desktop install, then the
 * classic `~/.dsh`.
 * @param explicit - `--home` value, when given.
 * @returns the chosen home and the rule that selected it.
 */
export function resolveHome(explicit) {
  if (explicit !== undefined) return { home: explicit, source: '--home' }
  if (process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== '') {
    return { home: process.env.DSH_HOME, source: '$DSH_HOME' }
  }

  const candidates = []
  if (process.platform === 'darwin') {
    candidates.push(join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness'))
  }
  candidates.push(join(homedir(), '.dsh'))
  for (const home of candidates) {
    if (existsSync(join(home, 'sessions'))) return { home, source: 'auto' }
  }
  return { home: candidates[candidates.length - 1], source: 'default' }
}
