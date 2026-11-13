import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { zstdCompressSync } from 'node:zlib'
import { buildGrid, formatDay, parseDay } from '../src/heatmap.js'
import { fromLedger } from '../src/render.js'
import { listSessionFiles, loadSessions } from '../src/sessions.js'
import { dayKey, foldUsage } from '../src/usage.js'
import { decodeLog, scanFrames } from '../src/zstd.js'

const usage = (input, output, cacheRead = 0) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
})

test('same turn/step usage replaces instead of double counting', () => {
  const events = [
    { type: 'assistant/chunk', time: Date.UTC(2026, 10, 12, 3), data: { turn: 1, step: 1, chunk: { type: 'usage', usage: usage(100, 10) } } },
    { type: 'assistant/message', time: Date.UTC(2026, 10, 12, 3), data: { turn: 1, step: 1, usage: usage(120, 12) } },
    { type: 'assistant/message', time: Date.UTC(2026, 10, 12, 4), data: { turn: 1, step: 2, usage: usage(50, 5) } },
  ]
  const folded = foldUsage([{ id: 's1', events }], { timeZone: 'UTC' })
  assert.equal(folded.days.length, 1)
  assert.equal(folded.days[0].uncachedInputTokens, 170)
  assert.equal(folded.days[0].outputTokens, 17)
  assert.equal(folded.days[0].requests, 2)
  assert.equal(folded.sessionsWithUsage, 1)
})

test('a replacement that crosses midnight moves tokens to the later day', () => {
  const events = [
    { type: 'assistant/chunk', time: Date.UTC(2026, 10, 11, 23, 59), data: { turn: 1, step: 1, chunk: { type: 'usage', usage: usage(100, 10) } } },
    { type: 'assistant/message', time: Date.UTC(2026, 10, 12, 0, 1), data: { turn: 1, step: 1, usage: usage(120, 12) } },
  ]
  const folded = foldUsage([{ id: 's1', events }], { timeZone: 'UTC' })
  assert.deepEqual(folded.days.map(day => day.date), ['2026-11-12'])
  assert.equal(folded.days[0].totalTokens, 132)
})

test('dayKey follows the configured zone', () => {
  const time = Date.UTC(2026, 10, 12, 16, 30)
  assert.equal(dayKey(time, 'UTC'), '2026-11-12')
  assert.equal(dayKey(time, 'Asia/Shanghai'), '2026-11-13')
})

test('grid starts on Sunday and covers the requested window', () => {
  const days = new Map([
    ['2026-11-12', 1_000],
    ['2026-11-11', 2_000],
    ['2026-11-10', 4_000],
    ['2026-11-09', 8_000],
  ])
  const grid = buildGrid(days, { end: '2026-11-12', weeks: 53 })
  assert.equal(grid.end, '2026-11-12')
  assert.equal(new Date(parseDay(grid.start)).getUTCDay(), 0)
  assert.equal(grid.columns, 53)
  assert.equal(grid.cells.length, 53 * 7 - (6 - new Date(parseDay('2026-11-12')).getUTCDay()))
  assert.equal(grid.stats.totalTokens, 15_000)
  assert.equal(grid.stats.activeDays, 4)
  assert.equal(grid.stats.peak, 8_000)
  assert.ok(grid.months.some(month => month.label === 'Nov'))
  for (const cell of grid.cells) assert.ok(cell.level >= 0 && cell.level <= 4)
  assert.equal(formatDay(parseDay('2026-11-12')), '2026-11-12')
})

test('a single active day still reaches the darkest level', () => {
  const grid = buildGrid(new Map([['2026-11-12', 500]]), { end: '2026-11-12', weeks: 4 })
  const active = grid.cells.filter(cell => cell.total > 0)
  assert.equal(active.length, 1)
  assert.equal(active[0].level, 4)
})

test('an exported ledger re-renders without session logs', () => {
  const ledger = {
    timeZone: 'UTC',
    window: { end: '2026-11-12' },
    title: '1.2K AI tokens in the last year',
    days: [{ date: '2026-11-12', totalTokens: 1_234 }],
    totals: { totalTokens: 1_234 },
  }
  const rendered = fromLedger(ledger)
  assert.equal(rendered.grid.end, '2026-11-12')
  assert.equal(rendered.grid.stats.totalTokens, 1_234)
  assert.equal(rendered.headline, '1.2K AI tokens in the last year')
})

test('zstd frames decode across appends and a torn tail is ignored', () => {
  const first = zstdCompressSync(Buffer.from('{"a":1}\n'))
  const second = zstdCompressSync(Buffer.from('{"b":2}\n'))
  const whole = Buffer.concat([first, second])
  assert.equal(scanFrames(whole).length, 2)
  assert.equal(decodeLog(whole).text, '{"a":1}\n{"b":2}\n')

  const torn = Buffer.concat([whole, second.subarray(0, second.length - 3)])
  assert.equal(decodeLog(torn).text, '{"a":1}\n{"b":2}\n')
})

test('the highest log version wins and duplicate ids keep the larger log', () => {
  const home = mkdtempSync(join(tmpdir(), 'token-heatmap-'))
  const sessionDir = join(home, 'sessions', 'ws', 'session-1')
  mkdirSync(sessionDir, { recursive: true })

  const header = `${JSON.stringify({ type: 'session', version: 4, id: 'session-1', createdAt: 1 })}\n`
  const event = (input) => `${JSON.stringify({ type: 'assistant/message', seq: 0, time: Date.UTC(2026, 10, 12), data: { turn: 1, step: 1, usage: usage(input, 1) } })}\n`
  writeFileSync(join(sessionDir, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(header + event(1))))
  writeFileSync(join(sessionDir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(header + event(9))))

  const files = listSessionFiles(home)
  assert.equal(files.length, 1)
  assert.ok(files[0].path.endsWith('session.v4.jsonl.zstd'))

  const loaded = loadSessions(files)
  assert.equal(loaded.sessions.length, 1)
  assert.equal(loaded.sessions[0].events.length, 1)
  assert.equal(foldUsage(loaded.sessions, { timeZone: 'UTC' }).days[0].uncachedInputTokens, 9)
})
