const { createMetricsStore } = require('../../server/metricsStore')

describe('metricsStore', () => {
  test('increments counters and exposes snapshot', () => {
    const m = createMetricsStore()
    m.inc('invalid_payload')
    m.inc('invalid_payload', 2)
    m.inc('resync_requested', 1, { reason: 'desync' })

    expect(m.get('invalid_payload')).toBe(3)
    const snap = m.snapshot()
    expect(snap['invalid_payload']).toBe(3)
  })

  test('evicts cold keys when maxKeys exceeded (many unique keys, last wins)', () => {
    const m = createMetricsStore({ maxKeys: 8 })
    for (let i = 0; i < 10; i++) {
      m.inc(`metric_${i}`)
    }
    const snap = m.snapshot()
    const keys = Object.keys(snap)
    expect(keys.length).toBeLessThanOrEqual(8)
    expect(keys).not.toContain('metric_0')
    expect(keys).not.toContain('metric_1')
    expect(keys).not.toContain('metric_2')
    expect(keys).toContain('metric_9')
  })

  test('prefers keeping recently incremented keys (LRU eviction)', () => {
    const m = createMetricsStore({ maxKeys: 4 })
    m.inc('a')
    m.inc('b')
    m.inc('c')
    m.inc('d')
    m.inc('e')
    m.inc('a')
    m.inc('f')
    const snap = m.snapshot()
    expect(snap.a).toBeGreaterThan(0)
    expect(snap.f).toBeGreaterThan(0)
    expect(snap).not.toHaveProperty('b')
    expect(snap).not.toHaveProperty('c')
  })
})

