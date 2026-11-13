/**
 * Read session logs through the harness query seam.
 *
 * `ctx.sessionQuery` is provider-independent: it serves live sessions and
 * whatever persistence backend is mounted, so the command keeps working when
 * the deployment stores logs in SQLite instead of JSONL.
 * @module token-heatmap/query
 */

/** Sessions read concurrently; each read holds one full log. */
const READ_CONCURRENCY = 4

/**
 * Load every session the query service can see.
 * @param query - `ctx.sessionQuery` implementation.
 * @returns sessions shaped like the JSONL loader's output, newest first.
 */
export async function readSessionsFromQuery(query) {
  const records = await query.listSessions()
  const sessions = new Array(records.length)
  let next = 0

  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= records.length) return
      const record = records[index]
      const snapshot = await query.readSession(record.header.id)
      sessions[index] = {
        id: record.header.id,
        createdAt: record.header.createdAt,
        cwd: record.header.cwd,
        events: snapshot.events,
      }
    }
  }

  const workers = Array.from({ length: Math.min(READ_CONCURRENCY, records.length) }, worker)
  await Promise.all(workers)
  return sessions
}
