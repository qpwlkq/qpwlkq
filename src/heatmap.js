/**
 * Build the 53-week calendar grid and its intensity levels.
 * @module token-heatmap/heatmap
 */

const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Convert a `YYYY-MM-DD` key into a UTC midnight timestamp.
 * @param key - calendar day key.
 * @returns epoch milliseconds at UTC midnight.
 */
export function parseDay(key) {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Convert a UTC timestamp into a `YYYY-MM-DD` key.
 * @param time - epoch milliseconds at UTC midnight.
 * @returns calendar day key.
 */
export function formatDay(time) {
  const date = new Date(time)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/**
 * Lay out one year of daily totals ending at a given day.
 * @param dayTotals - `YYYY-MM-DD` to token total.
 * @param options - `end` day key and number of week columns.
 * @returns grid cells, month labels, level thresholds, and window statistics.
 */
export function buildGrid(dayTotals, { end, weeks = 53 }) {
  const endTime = parseDay(end)
  const endWeekday = new Date(endTime).getUTCDay()
  const startTime = endTime - (weeks - 1) * 7 * DAY_MS - endWeekday * DAY_MS
  const columns = weeks

  const cells = []
  const values = []
  for (let week = 0; week < columns; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const time = startTime + (week * 7 + weekday) * DAY_MS
      if (time > endTime) continue
      const date = formatDay(time)
      const total = dayTotals.get(date) ?? 0
      if (total > 0) values.push(total)
      cells.push({ date, total, week, weekday })
    }
  }

  const thresholds = quantiles(values, [0.25, 0.5, 0.75])
  const distinct = new Set(values).size
  for (const cell of cells) {
    cell.level = levelOf(cell.total, thresholds, distinct)
  }

  const months = []
  for (let week = 0; week < columns; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const time = startTime + (week * 7 + weekday) * DAY_MS
      if (time > endTime) break
      const date = new Date(time)
      if (date.getUTCDate() === 1) {
        months.push({ week, label: MONTHS[date.getUTCMonth()] })
        break
      }
      if (week === 0 && weekday === 0) months.push({ week, label: MONTHS[date.getUTCMonth()] })
    }
  }

  let totalTokens = 0
  let peak = 0
  for (const cell of cells) {
    totalTokens += cell.total
    peak = Math.max(peak, cell.total)
  }

  return {
    start: formatDay(startTime),
    end,
    columns,
    cells,
    months,
    thresholds,
    distinct,
    stats: {
      totalTokens,
      activeDays: values.length,
      peak,
    },
  }
}

function levelOf(total, thresholds, distinct) {
  if (total <= 0) return 0
  if (distinct <= 1) return 4
  let level = 1
  for (const threshold of thresholds) if (total > threshold) level += 1
  return Math.min(level, 4)
}

function quantiles(values, points) {
  if (values.length === 0) return points.map(() => 0)
  const sorted = [...values].sort((left, right) => left - right)
  return points.map(point => sorted[Math.floor((sorted.length - 1) * point)])
}
