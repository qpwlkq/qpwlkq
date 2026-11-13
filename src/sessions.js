/**
 * Discover and decode durable session logs.
 *
 * One session directory may hold several format generations
 * (`session.jsonl.zstd`, `session.v3.jsonl.zstd`, `session.v4.jsonl.zstd`).
 * The highest version is the current log; older files are migration sources
 * and would double count if read too.
 * @module token-heatmap/sessions
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLog } from './zstd.js'

/** `session.jsonl.zstd`, `session.v4.jsonl.zstd`, or their plaintext forms. */
const LOG_NAME = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/

/**
 * List the newest log file of every session directory.
 * @param home - DSH home containing `sessions/`.
 * @param options - optional `sinceMs` cutoff applied to file mtime.
 * @returns candidate log files with their format version.
 */
export function listSessionFiles(home, { sinceMs = 0 } = {}) {
  const root = join(home, 'sessions')
  const files = []
  for (const workspace of safeReaddir(root)) {
    const workspaceDir = join(root, workspace)
    if (!isDirectory(workspaceDir)) continue
    for (const session of safeReaddir(workspaceDir)) {
      const sessionDir = join(workspaceDir, session)
      if (!isDirectory(sessionDir)) continue

      let best
      for (const name of safeReaddir(sessionDir)) {
        const match = LOG_NAME.exec(name)
        if (match === null) continue
        const path = join(sessionDir, name)
        let stat
        try {
          stat = statSync(path)
        } catch {
          continue // the directory changed while listing it
        }
        if (!stat.isFile() || stat.mtimeMs < sinceMs) continue
        const version = match[1] === undefined ? 0 : Number(match[1])
        if (best === undefined || version > best.version || (version === best.version && stat.size > best.size)) {
          best = { path, version, size: stat.size, mtimeMs: stat.mtimeMs }
        }
      }
      if (best !== undefined) files.push(best)
    }
  }
  return files
}

/**
 * Decode the given logs into one entry per session id.
 *
 * Duplicate ids (a session replayed under another workspace directory) keep
 * the largest decoded log, which is the most complete history.
 * @param files - output of {@link listSessionFiles}.
 * @returns sessions with header metadata and durable events, newest first.
 */
export function loadSessions(files) {
  const sessions = new Map()
  let skippedFrames = 0
  let corruptLines = 0

  for (const file of files) {
    const buffer = readFileSync(file.path)
    const decoded = file.path.endsWith('.zstd')
      ? decodeLog(buffer)
      : { text: buffer.toString('utf8'), skippedFrames: 0 }
    skippedFrames += decoded.skippedFrames

    let header
    const events = []
    for (const line of decoded.text.split('\n')) {
      if (line === '') continue
      let record
      try {
        record = JSON.parse(line)
      } catch {
        corruptLines += 1
        continue
      }
      if (record.type === 'session') header = record
      else events.push(record)
    }
    if (header?.id === undefined) continue

    const previous = sessions.get(header.id)
    if (previous !== undefined && previous.size >= decoded.text.length) continue
    sessions.set(header.id, {
      id: header.id,
      createdAt: header.createdAt,
      cwd: header.cwd,
      events,
      size: decoded.text.length,
    })
  }

  const ordered = [...sessions.values()].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
  return { sessions: ordered, skippedFrames, corruptLines }
}

function safeReaddir(path) {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
