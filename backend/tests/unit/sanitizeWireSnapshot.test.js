const { sanitizeWireSnapshot } = require('../../game/sanitizeWireSnapshot')

describe('sanitizeWireSnapshot', () => {
  test('never throws on malformed view shapes and normalizes to safe containers', () => {
    const bad = {
      players: null,
      turnOrder: 'nope',
      currentTrick: undefined,
      passedPlayers: { nope: true },
      roundLog: [{ round: 1, players: null }, 'bad-entry'],
      trickHistory: 123,
      hands: 'nope',
      playerStacks: { p1: { cards: null, points: 'x' } },
      state: null,
      currentPlayerIndex: 'bad',
    }

    expect(() => sanitizeWireSnapshot(bad)).not.toThrow()

    expect(Array.isArray(bad.players)).toBe(true)
    expect(Array.isArray(bad.turnOrder)).toBe(true)
    expect(Array.isArray(bad.currentTrick)).toBe(true)
    expect(Array.isArray(bad.passedPlayers)).toBe(true)
    expect(Array.isArray(bad.roundLog)).toBe(true)
    expect(Array.isArray(bad.trickHistory)).toBe(true)
    expect(bad.state).toBe('waiting')
    expect(bad.currentPlayerIndex).toBe(0)
    expect(typeof bad.hands).toBe('object')
    expect(Array.isArray(bad.playerStacks.p1.cards)).toBe(true)
    expect(typeof bad.playerStacks.p1.points).toBe('number')
    expect(typeof bad.protocolVersion).toBe('number')
  })

  test('normalizes roundLog entry players to arrays', () => {
    const bad = {
      roundLog: [{ round: 1, players: 'nope' }],
    }
    sanitizeWireSnapshot(bad)
    expect(Array.isArray(bad.roundLog[0].players)).toBe(true)
    expect(bad.roundLog[0].players).toHaveLength(0)
  })
})

