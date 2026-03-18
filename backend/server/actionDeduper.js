/**
 * Simple in-memory action deduplicator for socket commands.
 * Professional requirement targeted: idempotency so double-click / retries
 * don't advance game state twice.
 */

function createActionDeduper({ ttlMs = 30_000 } = {}) {
  // gameId -> Map(actionKey -> { ok: boolean, errorMessage?: string, at: number })
  const byGame = new Map()

  const now = () => Date.now()

  function actionKey(gameId, playerId, actionId) {
    return `${gameId}:${playerId}:${actionId}`
  }

  function getGameMap(gameId) {
    let m = byGame.get(gameId)
    if (!m) {
      m = new Map()
      byGame.set(gameId, m)
    }
    return m
  }

  function prune(m) {
    const t = now() - ttlMs
    for (const [k, v] of m.entries()) {
      if (!v || v.at == null || v.at < t) m.delete(k)
    }
  }

  /**
   * Checks whether this action was already processed.
   * @returns {null | { ok: boolean, errorMessage?: string }}
   */
  function getResultIfDuplicate(gameId, playerId, actionId) {
    if (!gameId || !playerId || !actionId) return null
    const m = getGameMap(gameId)
    prune(m)
    const k = actionKey(gameId, playerId, actionId)
    const v = m.get(k)
    if (!v) return null
    return { ok: v.ok, errorMessage: v.errorMessage }
  }

  /**
   * Stores the result so subsequent duplicates can be answered consistently.
   */
  function storeResult(gameId, playerId, actionId, result) {
    if (!gameId || !playerId || !actionId) return
    const m = getGameMap(gameId)
    prune(m)
    const k = actionKey(gameId, playerId, actionId)
    m.set(k, { ok: !!result?.success, errorMessage: result?.errorMessage, at: now() })
  }

  return {
    getResultIfDuplicate,
    storeResult,
    // exported for testing/debugging
    __test__: { actionKey },
  }
}

module.exports = { createActionDeduper }

