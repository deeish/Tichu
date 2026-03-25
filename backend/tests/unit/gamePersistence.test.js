const { createGameplayPersistence, normalizeRestoredGame, isTestGame } = require('../../server/gamePersistence')

describe('gamePersistence', () => {
  test('noop when REDIS_URL unset', async () => {
    const p = createGameplayPersistence('')
    await p.init()
    await p.restoreIntoMap(new Map())
    p.scheduleSave({ id: 'x', players: [] })
    await p.deleteGame('x')
    expect(p.isEnabled).toBe(false)
  })

  test('normalizeRestoredGame clears sockets and marks disconnected', () => {
    const game = {
      id: 'g1',
      players: [
        { id: 'p1', socketId: 'sock', disconnected: false, token: 't' },
        { id: 'p2', socketId: 's2', disconnected: false },
      ],
    }
    normalizeRestoredGame(game)
    expect(game.players[0].socketId).toBeNull()
    expect(game.players[0].disconnected).toBe(true)
    expect(game.players[0].disconnectedAt).toBeDefined()
    expect(game.players[1].socketId).toBeNull()
  })

  test('isTestGame detects test players', () => {
    expect(isTestGame({ players: [{ isTestPlayer: true }] })).toBe(true)
    expect(isTestGame({ players: [{ id: 'a' }] })).toBe(false)
  })
})
