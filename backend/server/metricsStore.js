/**
 * Simple in-memory metrics counters.
 * The checklist only requires that metrics exist; persistent storage can be added later.
 */

function createMetricsStore() {
  const counters = new Map()

  function inc(name, value = 1, extra) {
    const k = extra ? `${name}|${JSON.stringify(extra)}` : name
    const prev = counters.get(k) ?? 0
    counters.set(k, prev + value)
    return counters.get(k)
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

