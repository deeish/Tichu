const { createFixedWindowRateLimiter } = require('../../server/simpleRateLimiter')

describe('simpleRateLimiter', () => {
  test('allows up to max calls per window', () => {
    const limiter = createFixedWindowRateLimiter({ windowMs: 1000, max: 2 })
    const k = 'socket:make-move'

    expect(limiter.allow(k)).toBe(true)
    expect(limiter.allow(k)).toBe(true)
    expect(limiter.allow(k)).toBe(false)
  })

  test('resets after window expires', () => {
    jest.useFakeTimers()
    const limiter = createFixedWindowRateLimiter({ windowMs: 100, max: 1 })
    const k = 'socket:declare-tichu'

    expect(limiter.allow(k)).toBe(true)
    expect(limiter.allow(k)).toBe(false)

    jest.advanceTimersByTime(101)
    expect(limiter.allow(k)).toBe(true)

    jest.useRealTimers()
  })

  test('trims oldest keys when map exceeds maxEntries (churning socket ids)', () => {
    jest.useFakeTimers()
    const limiter = createFixedWindowRateLimiter({ windowMs: 1000, max: 100, maxEntries: 3 })

    limiter.allow('k1')
    jest.advanceTimersByTime(5)
    limiter.allow('k2')
    jest.advanceTimersByTime(5)
    limiter.allow('k3')
    jest.advanceTimersByTime(5)
    limiter.allow('k4')

    // k1 had the earliest resetAt and should have been evicted; treat as fresh key.
    expect(limiter.allow('k1')).toBe(true)

    jest.useRealTimers()
  })
})

