import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveConfig } from '../src/config.js'

const home = '/tmp/dsh-home'

test('config defaults to a token-heatmap directory under the DSH home', () => {
  const config = resolveConfig(undefined, { home })
  assert.equal(config.home, home)
  assert.equal(config.outputDir, '/tmp/dsh-home/token-heatmap')
  assert.equal(config.weeks, 53)
  assert.equal(config.autoUpdate, false)
  assert.equal(config.autoUpdateIntervalHours, 6)
  assert.equal(config.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone)
})

test('config accepts every override', () => {
  const config = resolveConfig({
    outputDir: '/tmp/out',
    timeZone: 'Asia/Shanghai',
    weeks: 26,
    autoUpdate: true,
    autoUpdateIntervalHours: 12,
  }, { home })
  assert.deepEqual(config, {
    home,
    outputDir: '/tmp/out',
    timeZone: 'Asia/Shanghai',
    weeks: 26,
    autoUpdate: true,
    autoUpdateIntervalHours: 12,
  })
})

test('config rejects an out-of-range week count', () => {
  assert.throws(() => resolveConfig({ weeks: 3 }, { home }), /between 4 and 104/)
  assert.throws(() => resolveConfig({ weeks: 1.5 }, { home }), /between 4 and 104/)
})

test('config rejects an invalid time zone instead of silently using UTC', () => {
  assert.throws(() => resolveConfig({ timeZone: 'Mars/Olympus' }, { home }), /invalid timeZone/)
})

test('config rejects a non-boolean autoUpdate and an out-of-range interval', () => {
  assert.throws(() => resolveConfig({ autoUpdate: 'yes' }, { home }), /autoUpdate must be a boolean/)
  assert.throws(() => resolveConfig({ autoUpdateIntervalHours: 0 }, { home }), /between 1 and 168/)
  assert.throws(() => resolveConfig({ autoUpdateIntervalHours: 169 }, { home }), /between 1 and 168/)
})
