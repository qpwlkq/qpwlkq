import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../src/plugin.js'

/** Build a context whose only composed seam is the command registry. */
function fakeContext(sessionQuery) {
  const registered = []
  const ctx = {
    inject(_deps, callback) {
      callback({ commands: { register: definition => registered.push(definition) } })
    },
    get(name, _strict) {
      return name === 'sessionQuery' ? sessionQuery : undefined
    },
  }
  return { ctx, registered }
}

function tempHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'token-heatmap-plugin-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
  return home
}

const usageEvent = (time, input, output) => ({
  type: 'assistant/message',
  time,
  data: { turn: 1, step: 1, usage: { inputTokens: input, outputTokens: output } },
})

test('the command registers and writes when no query seam is composed', async (t) => {
  const home = tempHome(t)
  const { ctx, registered } = fakeContext(undefined)
  apply(ctx, { outputDir: join(home, 'out'), timeZone: 'UTC' })

  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'token-heatmap')

  const result = await registered[0].handler()
  assert.equal(result.kind, 'success')
  assert.ok(existsSync(join(home, 'out', 'token-heatmap.svg')))
  assert.ok(existsSync(join(home, 'out', 'token-heatmap-dark.svg')))
})

test('the command reads sessions through sessionQuery when present', async (t) => {
  const home = tempHome(t)
  const query = {
    listSessions: async () => [{ header: { id: 's1', createdAt: 1, cwd: '/work' } }],
    readSession: async () => ({ events: [usageEvent(Date.UTC(2026, 10, 12), 100, 10)] }),
  }
  const { ctx, registered } = fakeContext(query)
  apply(ctx, { outputDir: join(home, 'out'), timeZone: 'UTC' })

  const result = await registered[0].handler()
  assert.equal(result.kind, 'success')

  const ledger = JSON.parse(readFileSync(join(home, 'out', 'token-usage.json'), 'utf8'))
  assert.equal(ledger.totals.totalTokens, 110)
  assert.equal(ledger.diagnostics.source, 'sessionQuery')
  assert.equal(ledger.diagnostics.sessions, 1)
})

test('a failing query backend falls back to the durable logs', async (t) => {
  const home = tempHome(t)
  const query = {
    listSessions: async () => [{ header: { id: 's1', createdAt: 1 } }],
    readSession: async () => {
      throw new Error('backend offline')
    },
  }
  const { ctx, registered } = fakeContext(query)
  apply(ctx, { outputDir: join(home, 'out'), timeZone: 'UTC' })

  const result = await registered[0].handler()
  assert.equal(result.kind, 'success')

  const ledger = JSON.parse(readFileSync(join(home, 'out', 'token-usage.json'), 'utf8'))
  assert.equal(ledger.diagnostics.source, 'session-log')
  assert.equal(ledger.totals.totalTokens, 0)
})
