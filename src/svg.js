/**
 * Render the calendar grid as a standalone SVG suitable for a GitHub README.
 * @module token-heatmap/svg
 */

import { formatTokens } from './format.js'

const CELL = 11
const GAP = 3
const PITCH = CELL + GAP
const LEFT = 52
const TOP = 58
const GRID_WIDTH = 53 * PITCH - GAP
const GRID_HEIGHT = 7 * PITCH - GAP

/** GitHub's own contribution palette, light and dark. */
const PALETTES = {
  light: {
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    text: '#1f2328',
    muted: '#59636e',
    border: '#d0d7de',
  },
  dark: {
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    text: '#e6edf3',
    muted: '#9198a1',
    border: '#30363d',
  },
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const WEEKDAYS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

/**
 * Render one theme's SVG.
 * @param grid - output of `buildGrid`.
 * @param options - theme, title, and footer note.
 * @returns complete SVG markup.
 */
export function renderSvg(grid, { theme = 'light', title, note }) {
  const palette = PALETTES[theme]
  const width = LEFT + GRID_WIDTH + 18
  const height = TOP + GRID_HEIGHT + 56
  const footerY = TOP + GRID_HEIGHT + 26
  const parts = []

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x="${LEFT - 8}" y="${TOP - 8}" width="${GRID_WIDTH + 16}" height="${GRID_HEIGHT + 16}" rx="6" fill="none" stroke="${palette.border}"/>`,
    `<text x="16" y="24" font-family="${FONT}" font-size="15" font-weight="600" fill="${palette.text}">${escapeXml(title)}</text>`,
  )

  for (const month of grid.months) {
    parts.push(
      `<text x="${LEFT + month.week * PITCH}" y="${TOP - 14}" font-family="${FONT}" font-size="10.5" fill="${palette.muted}">${month.label}</text>`,
    )
  }

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const label = WEEKDAYS[weekday]
    if (label === '') continue
    parts.push(
      `<text x="${LEFT - 12}" y="${TOP + weekday * PITCH + 9}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${palette.muted}">${label}</text>`,
    )
  }

  for (const cell of grid.cells) {
    parts.push(
      `<rect x="${LEFT + cell.week * PITCH}" y="${TOP + cell.weekday * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${palette.levels[cell.level]}"><title>${cell.date}: ${cell.total === 0 ? 'no usage' : `${formatTokens(cell.total)} tokens`}</title></rect>`,
    )
  }

  parts.push(
    `<text x="16" y="${footerY}" font-family="${FONT}" font-size="10.5" fill="${palette.muted}">${escapeXml(note)}</text>`,
    legend(footerY, palette),
    '</svg>',
  )

  return parts.join('')
}

function legend(y, palette) {
  const swatchX = 26 + 6
  const swatchEnd = swatchX + 5 * PITCH - GAP
  const legendWidth = swatchEnd + 6 + 30
  const start = LEFT + GRID_WIDTH + 10 - legendWidth
  const swatches = palette.levels
    .map((color, index) => `<rect x="${swatchX + index * PITCH}" y="0" width="${CELL}" height="${CELL}" rx="2" fill="${color}"/>`)
    .join('')
  return `<g transform="translate(${start} ${y - 9})" font-family="${FONT}" font-size="10.5" fill="${palette.muted}">`
    + '<text x="0" y="9">Less</text>'
    + swatches
    + `<text x="${swatchEnd + 6}" y="9">More</text>`
    + '</g>'
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
