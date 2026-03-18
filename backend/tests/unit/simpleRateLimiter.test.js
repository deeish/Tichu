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
})

