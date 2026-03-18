/**
 * Very small in-memory rate limiter for socket events.
 * Keyed by (socketId + eventName).
 *
 * Purpose: protect the server from abusive/accidental high-frequency emits
 * that can otherwise cause CPU churn or amplify bugs into crashes.
 */

function createFixedWindowRateLimiter({ windowMs = 1500, max = 6 } = {}) {
  const state = new Map()

  function now() {
    return Date.now()
  }

  function allow(key) {
    if (!key) return true
    const t = now()
    const entry = state.get(key)

    if (!entry) {
      state.set(key, { count: 1, resetAt: t + windowMs })
      return true
    }

    if (t >= entry.resetAt) {
      const next = { count: 1, resetAt: t + windowMs }
      state.set(key, next)
      return true
    }

    if (entry.count >= max) return false

    entry.count += 1
    return true
  }

  return { allow }
}

module.exports = { createFixedWindowRateLimiter }

