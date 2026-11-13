/**
 * Human-readable token counts for SVG labels.
 * @module token-heatmap/format
 */

/**
 * Format a token count as `812`, `12.4K`, or `3.1M`.
 * @param tokens - non-negative token count.
 * @returns compact label, at most one decimal below 100 units.
 */
export function formatTokens(tokens) {
  if (tokens < 1_000) return String(Math.round(tokens))
  if (tokens < 1_000_000) {
    const value = tokens / 1_000
    return `${value < 10 ? value.toFixed(1) : Math.round(value)}K`
  }
  const value = tokens / 1_000_000
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}M`
}

/**
 * Format a per-day token count with thousands separators.
 * @param tokens - non-negative token count.
 * @returns grouped decimal, e.g. `1,204,331`.
 */
export function formatExact(tokens) {
  return Math.round(tokens).toLocaleString('en-US')
}
