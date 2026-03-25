/**
 * Simple in-memory metrics counters.
 * The checklist only requires that metrics exist; persistent storage can be added later.
 *
 * `maxKeys` bounds the Map: counter keys are derived from `extra` JSON; without a cap,
 * a regression or future event could grow memory without bound on a long-lived process.
 * When over capacity, evict **least-recently-updated** keys first: each `inc` does
 * `delete` + `set` so the key moves to the Map’s end (ES Map iteration order).
 * Pure “oldest insertion” eviction would drop hot counters that happened to be
 * created first — bad for signal on a long-lived server.
 */

function createMetricsStore({ maxKeys = 4096 } = {}) {
  const counters = new Map()

  function trimToBudget() {
    const budget = Math.max(1, Math.floor(maxKeys * 0.75))
    while (counters.size > budget) {
      const lru = counters.keys().next().value
      if (lru === undefined) break
      counters.delete(lru)
    }
  }

  function inc(name, value = 1, extra) {
    const k = extra ? `${name}|${JSON.stringify(extra)}` : name
    const prev = counters.get(k) ?? 0
    const next = prev + value
    counters.delete(k)
    counters.set(k, next)
    if (counters.size > maxKeys) {
      trimToBudget()
    }
    return next
  }

  function get(name) {
    return counters.get(name) ?? 0
  }

  function snapshot() {
    const out = {}
    for (const [k, v] of counters.entries()) out[k] = v
    return out
  }

  return {
    inc,
    get,
    snapshot,
  }
}

module.exports = { createMetricsStore }

