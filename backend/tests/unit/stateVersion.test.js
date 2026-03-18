describe('server stateVersion (monotonic ordering)', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('broadcastGameUpdate assigns increasing stateVersion and preserves it in emitted snapshots', () => {
    const { broadcastGameUpdate } = require('../../server/socketHandlers')

    const emits = []
    const mockIo = {
      to: () => ({
        emit: (eventName, payload) => {
          if (eventName === 'game-update') emits.push(payload)
        },
      }),
    }

    const game = {
      id: 'g1',
      state: 'playing',
      stateVersion: 0,
      players: [{ id: 'p1', socketId: 's1', token: 'tok1', name: 'A', team: 1 }],
      hands: { p1: [] },
      currentTrick: [],
      passedPlayers: [],
      turnOrder: [{ id: 'p1', team: 1, name: 'A' }],
      currentPlayerIndex: 0,
      roundLog: [],
      trickHistory: [],
    }

    broadcastGameUpdate(mockIo, game)
    // First call emits immediately
    expect(emits).toHaveLength(1)
    expect(emits[0]?.game?.stateVersion).toBe(1)

    broadcastGameUpdate(mockIo, game)
    // Second call is throttled; nothing immediately emitted
    expect(emits).toHaveLength(1)

    // Flush throttle timer
    jest.advanceTimersByTime(90)
    expect(emits).toHaveLength(2)
    expect(emits[1]?.game?.stateVersion).toBe(2)
  })
})

