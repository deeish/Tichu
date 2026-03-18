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
})

