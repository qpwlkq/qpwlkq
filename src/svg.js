/**
 * Render the calendar grid as a standalone SVG suitable for a GitHub README.
 *
 * The card encloses the month labels, weekday labels, grid, footer, and
 * legend — the same structure GitHub's own contribution card uses — so the
 * labels never sit in the outer margin.
 * @module token-heatmap/svg
 */

import { formatTokens } from './format.js'

const CELL = 11
const GAP = 3
const PITCH = CELL + GAP
const GRID_WIDTH = 53 * PITCH - GAP
const GRID_HEIGHT = 7 * PITCH - GAP

const MARGIN = 20
const CARD_X = MARGIN
const CARD_TOP = 36
const MONTH_Y = CARD_TOP + 24
const TOP = CARD_TOP + 36
const LABEL_END = CARD_X + 42
const LEFT = CARD_X + 54
const CARD_RIGHT = LEFT + GRID_WIDTH + 14
const FOOTER_Y = TOP + GRID_HEIGHT + 28
const CARD_BOTTOM = FOOTER_Y + 12
const WIDTH = CARD_RIGHT + MARGIN
const HEIGHT = CARD_BOTTOM + 14

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
  const parts = []

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<text x="${MARGIN}" y="24" font-family="${FONT}" font-size="15" font-weight="600" fill="${palette.text}">${escapeXml(title)}</text>`,
    `<rect x="${CARD_X}" y="${CARD_TOP}" width="${CARD_RIGHT - CARD_X}" height="${CARD_BOTTOM - CARD_TOP}" rx="6" fill="none" stroke="${palette.border}"/>`,
  )

  for (const month of grid.months) {
    parts.push(
      `<text x="${LEFT + month.week * PITCH}" y="${MONTH_Y}" font-family="${FONT}" font-size="10.5" fill="${palette.muted}">${month.label}</text>`,
    )
  }

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const label = WEEKDAYS[weekday]
    if (label === '') continue
    parts.push(
      `<text x="${LABEL_END}" y="${TOP + weekday * PITCH + 9}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${palette.muted}">${label}</text>`,
    )
  }

  for (const cell of grid.cells) {
    parts.push(
      `<rect x="${LEFT + cell.week * PITCH}" y="${TOP + cell.weekday * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${palette.levels[cell.level]}"><title>${cell.date}: ${cell.total === 0 ? 'no usage' : `${formatTokens(cell.total)} tokens`}</title></rect>`,
    )
  }

  parts.push(
    `<text x="${CARD_X + 14}" y="${FOOTER_Y}" font-family="${FONT}" font-size="10.5" fill="${palette.muted}">${escapeXml(note)}</text>`,
    legend(CARD_RIGHT - 14, FOOTER_Y, palette),
    '</svg>',
  )

  return parts.join('')
}

function legend(rightEdge, y, palette) {
  const swatchX = 26 + 6
  const swatchEnd = swatchX + 5 * PITCH - GAP
  const legendWidth = swatchEnd + 6 + 30
  const start = rightEdge - legendWidth
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
