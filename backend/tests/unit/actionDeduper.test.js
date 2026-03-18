const { createActionDeduper } = require('../../server/actionDeduper')

describe('actionDeduper', () => {
  test('returns null for first-time actions and returns stored result for duplicates', () => {
    const deduper = createActionDeduper({ ttlMs: 30_000 })
    const gameId = 'g1'
    const playerId = 'p1'
    const actionId = 'a1'

    expect(deduper.getResultIfDuplicate(gameId, playerId, actionId)).toBeNull()

    deduper.storeResult(gameId, playerId, actionId, { success: false, errorMessage: 'nope' })

    expect(deduper.getResultIfDuplicate(gameId, playerId, actionId)).toEqual({ ok: false, errorMessage: 'nope' })
  })

  test('prunes old entries after ttl', () => {
    jest.useFakeTimers()
    const deduper = createActionDeduper({ ttlMs: 100 })
    const gameId = 'g2'
    const playerId = 'p2'
    const actionId = 'a2'

    deduper.storeResult(gameId, playerId, actionId, { success: true })
    jest.advanceTimersByTime(200)

    expect(deduper.getResultIfDuplicate(gameId, playerId, actionId)).toBeNull()
    jest.useRealTimers()
  })
})

