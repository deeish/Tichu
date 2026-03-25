/**
 * Very small in-memory rate limiter for socket events.
 * Keyed by (socketId + eventName).
 *
 * Purpose: protect the server from abusive/accidental high-frequency emits
 * that can otherwise cause CPU churn or amplify bugs into crashes.
 *
 * `maxEntries` bounds Map growth: churning socket ids (or rare prune cycles on
 * low-traffic limiters) cannot grow memory without bound on a long-lived process.
 */

function createFixedWindowRateLimiter({ windowMs = 1500, max = 6, maxEntries = 8192 } = {}) {
  const state = new Map()
  let ops = 0

  function now() {
    return Date.now()
  }

  function pruneIdle() {
    const t = now()
    const idleCutoff = t - Math.max(60_000, windowMs * 4)
    for (const [k, entry] of state.entries()) {
      if (entry.resetAt < idleCutoff) state.delete(k)
    }
  }

  /** Drop oldest windows first (smallest resetAt), then fresh keys if still over cap. */
  function trimExcess() {
    pruneIdle()
    let overflow = state.size - maxEntries
    if (overflow <= 0) return
    const ranked = [...state.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    for (let i = 0; i < overflow && i < ranked.length; i++) {
      state.delete(ranked[i][0])
    }
  }

  function allow(key) {
    if (!key) return true
    if (++ops % 128 === 0) pruneIdle()
    if (state.size > maxEntries) trimExcess()

    const t = now()
    const entry = state.get(key)

    let allowed
    if (!entry) {
      state.set(key, { count: 1, resetAt: t + windowMs })
      allowed = true
    } else if (t >= entry.resetAt) {
      state.set(key, { count: 1, resetAt: t + windowMs })
      allowed = true
    } else if (entry.count >= max) {
      allowed = false
    } else {
      entry.count += 1
      allowed = true
    }

    if (state.size > maxEntries) trimExcess()
    return allowed
  }

  return { allow }
}

module.exports = { createFixedWindowRateLimiter }

