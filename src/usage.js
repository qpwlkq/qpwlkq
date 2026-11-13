/**
 * Fold durable assistant usage samples into per-day token buckets.
 *
 * A session may report the same `(turn, step)` twice: an early usage chunk
 * and the finalized assistant message. The later sample replaces the earlier
 * one, exactly as `dsh-token-meter` folds its `tokenUsage` projection, so a
 * request is counted once.
 * @module token-heatmap/usage
 */

/** Provider token buckets, mirroring `TokenUsage` from `@deepseek-ai/dsh-llm`. */
export function emptyBuckets() {
  return {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

/**
 * Sum every bucket: input, output, and both cache directions.
 * @param buckets - one day's or one request's buckets.
 * @returns the processed token total.
 */
export function totalOf(buckets) {
  return buckets.uncachedInputTokens
    + buckets.outputTokens
    + buckets.cacheReadTokens
    + buckets.cacheWriteTokens
}

/**
 * Extract one provider usage sample from a durable event.
 * @param event - a durable session event.
 * @returns the sample's step coordinates and usage, or undefined.
 */
export function readUsageSample(event) {
  if (event.type === 'assistant/chunk') {
    const chunk = event.data?.chunk
    if (chunk?.type === 'usage' && chunk.usage !== undefined) {
      return { turn: event.data.turn, step: event.data.step, usage: chunk.usage }
    }
    return undefined
  }
  if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
    return { turn: event.data.turn, step: event.data.step, usage: event.data.usage }
  }
  return undefined
}

/**
 * Calendar day of an epoch timestamp in a fixed IANA time zone.
 * @param time - epoch milliseconds.
 * @param timeZone - IANA zone name.
 * @returns `YYYY-MM-DD`.
 */
export function dayKey(time, timeZone) {
  const formatter = dayFormatter(timeZone)
  return formatter.format(new Date(time))
}

const DAY_FORMATTERS = new Map()

function dayFormatter(timeZone) {
  let formatter = DAY_FORMATTERS.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    DAY_FORMATTERS.set(timeZone, formatter)
  }
  return formatter
}

/**
 * Aggregate usage across sessions.
 * @param sessions - decoded sessions carrying durable events.
 * @param options - `timeZone` used to assign each sample to a calendar day.
 * @returns per-day buckets sorted by date, plus totals and activity counts.
 */
export function foldUsage(sessions, { timeZone }) {
  dayFormatter(timeZone) // fail fast on an invalid zone before reading events
  const days = new Map()
  let sessionsWithUsage = 0

  const day = (key) => {
    let entry = days.get(key)
    if (entry === undefined) {
      entry = { date: key, ...emptyBuckets(), requests: 0 }
      days.set(key, entry)
    }
    return entry
  }
  const add = (entry, buckets) => {
    entry.uncachedInputTokens += buckets.uncachedInputTokens
    entry.outputTokens += buckets.outputTokens
    entry.cacheReadTokens += buckets.cacheReadTokens
    entry.cacheWriteTokens += buckets.cacheWriteTokens
  }
  const subtract = (entry, buckets) => {
    entry.uncachedInputTokens -= buckets.uncachedInputTokens
    entry.outputTokens -= buckets.outputTokens
    entry.cacheReadTokens -= buckets.cacheReadTokens
    entry.cacheWriteTokens -= buckets.cacheWriteTokens
  }

  for (const session of sessions) {
    let last
    let counted = false
    for (const event of session.events) {
      const sample = readUsageSample(event)
      if (sample === undefined || !Number.isFinite(event.time)) continue

      const buckets = {
        uncachedInputTokens: sample.usage.inputTokens ?? 0,
        outputTokens: sample.usage.outputTokens ?? 0,
        cacheReadTokens: sample.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: sample.usage.cacheWriteTokens ?? 0,
      }
      const date = dayKey(event.time, timeZone)
      const replaces = last !== undefined
        && last.turn === sample.turn
        && last.step === sample.step

      if (replaces) {
        subtract(day(last.date), last.buckets)
      } else {
        day(date).requests += 1
        counted = true
      }
      add(day(date), buckets)
      last = { turn: sample.turn, step: sample.step, date, buckets }
    }
    if (counted) sessionsWithUsage += 1
  }

  const ordered = [...days.values()]
    .filter(entry => totalOf(entry) > 0)
    .sort((left, right) => left.date.localeCompare(right.date))

  const totals = { ...emptyBuckets(), requests: 0 }
  for (const entry of ordered) {
    totals.uncachedInputTokens += entry.uncachedInputTokens
    totals.outputTokens += entry.outputTokens
    totals.cacheReadTokens += entry.cacheReadTokens
    totals.cacheWriteTokens += entry.cacheWriteTokens
    totals.requests += entry.requests
  }

  return {
    days: ordered.map(entry => ({ ...entry, totalTokens: totalOf(entry) })),
    totals: { ...totals, totalTokens: totalOf(totals) },
    sessionsWithUsage,
  }
}
