/**
 * Chaos harness (F3)
 *
 * Goal: ensure the backend survives common "random crash" triggers:
 * - malformed card payloads
 * - duplicate commands (same actionId)
 * - oversized payloads
 * and that the server can still respond after the chaos burst.
 *
 * Note: This is a server-side integration harness (no frontend mounting).
 * Passing => server doesn't crash and responds with structured errors/state.
 */

const http = require('http')
const socketIo = require('socket.io')
const Client = require('socket.io-client')
const { setupSocketHandlers } = require('../../server/socketHandlers')

describe('Chaos harness (F3)', () => {
  jest.setTimeout(20000)

  test('server survives malformed + duplicate commands and stays responsive', async () => {
    const games = new Map()
    const players = new Map()

    const server = http.createServer()
    const io = socketIo(server, { cors: { origin: '*' } })
    setupSocketHandlers(io, games, players)

    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    })

    await new Promise((resolve) => client.on('connect', resolve))

    const socketId = client.id
    const exchangeGameId = 'chaos-exchange-game'
    const playingGameId = 'chaos-playing-game'
    const playerId = 'p1'

    const c1 = { type: 'standard', rank: 'A', suit: 'hearts' }
    const c2 = { type: 'standard', rank: 'K', suit: 'hearts' }
    const c3 = { type: 'standard', rank: 'Q', suit: 'hearts' }

    // Minimal exchanging game: enough for exchangeCards() input validation and success path.
    const exchangeGame = {
      id: exchangeGameId,
      state: 'exchanging',
      stateVersion: 0,
      players: [
        { id: playerId, socketId, name: 'Player 1', team: 1, token: 'tok1' },
        { id: 'p2', socketId: null, name: 'Player 2', team: 1, token: 'tok2' },
        { id: 'p3', socketId: null, name: 'Player 3', team: 2, token: 'tok3' },
        { id: 'p4', socketId: null, name: 'Player 4', team: 2, token: 'tok4' },
      ],
      currentPlayerIndex: 0,
      leadPlayer: playerId,
      turnOrder: [
        { id: playerId, team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' },
      ],
      hands: {
        [playerId]: [c1, c2, c3],
        p2: [],
        p3: [],
        p4: [],
      },
      currentTrick: [],
      passedPlayers: [],
      roundLog: [],
      trickHistory: [],
      playerStacks: {
        [playerId]: { cards: [], points: 0 },
        p2: { cards: [], points: 0 },
        p3: { cards: [], points: 0 },
        p4: { cards: [], points: 0 },
      },

      exchangeCards: {},
      exchangeComplete: {},
      exchangeRecipients: [],
      cardsRevealed: {},
      remainingCards: {},
      firstCardPlayed: {},
      tichuDeclarations: {},
      grandTichuDeclarations: {},
      deck: [],
      scores: { team1: 0, team2: 0 },
      playersOut: [],
      dogPriorityPlayer: null,
      mahJongWish: null,
      mahJongPlayed: false,
      playerStats: {},
      dragonPlayed: null,
      dragonOpponentSelection: null,
      winner: null,
    }

    // Minimal playing game: enough for declareTichu() requirements.
    const playingGame = {
      id: playingGameId,
      state: 'playing',
      stateVersion: 0,
      players: [
        { id: playerId, socketId, name: 'Player 1', team: 1, token: 'tok1' },
        { id: 'p2', socketId: null, name: 'Player 2', team: 1, token: 'tok2' },
        { id: 'p3', socketId: null, name: 'Player 3', team: 2, token: 'tok3' },
        { id: 'p4', socketId: null, name: 'Player 4', team: 2, token: 'tok4' },
      ],
      currentPlayerIndex: 0,
      leadPlayer: playerId,
      turnOrder: [
        { id: playerId, team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' },
      ],
      currentTrick: [],
      passedPlayers: [],
      roundLog: [],
      trickHistory: [],
      hands: {
        [playerId]: [{ type: 'special', name: 'dog' }],
        p2: [],
        p3: [],
        p4: [],
      },
      playerStacks: {
        [playerId]: { cards: [], points: 0 },
        p2: { cards: [], points: 0 },
        p3: { cards: [], points: 0 },
        p4: { cards: [], points: 0 },
      },
      exchangeCards: {},
      exchangeComplete: {},
      exchangeRecipients: [],
      cardsRevealed: {},
      remainingCards: {},
      firstCardPlayed: { [playerId]: false },
      tichuDeclarations: {},
      grandTichuDeclarations: {},
      deck: [],
      scores: { team1: 0, team2: 0 },
      playersOut: [],
      dogPriorityPlayer: null,
      mahJongWish: null,
      mahJongPlayed: false,
      playerStats: {},
      dragonPlayed: null,
      dragonOpponentSelection: null,
      winner: null,
    }

    games.set(exchangeGameId, exchangeGame)
    games.set(playingGameId, playingGame)

    players.set(socketId, { gameId: exchangeGameId, playerName: 'Player 1' })

    const errors = []
    const gameState = []
    const gameUpdate = []

    client.on('error', (data) => errors.push(data))
    client.on('game-state', (data) => gameState.push(data))
    client.on('game-update', (data) => gameUpdate.push(data))

    // 1) Malformed exchange-cards payload (should error, not crash).
    client.emit('exchange-cards', {
      actionId: 'chaos-ex-malformed',
      requestId: 'req-1',
      cards: [null],
    })

    // 2) Duplicate exchange-cards with same actionId (should dedupe).
    const exchangeOkActionId = 'chaos-ex-ok-1'
    client.emit('exchange-cards', {
      actionId: exchangeOkActionId,
      requestId: 'req-2',
      cards: [c1, c2, c3],
    })
    client.emit('exchange-cards', {
      actionId: exchangeOkActionId,
      requestId: 'req-3',
      cards: [c1, c2, c3],
    })

    // 3) Switch to playing game and send duplicate declare-tichu (should dedupe).
    players.set(socketId, { gameId: playingGameId, playerName: 'Player 1' })

    const declareActionId = 'chaos-declare-dup-1'
    client.emit('declare-tichu', { actionId: declareActionId, requestId: 'req-4' })
    client.emit('declare-tichu', { actionId: declareActionId, requestId: 'req-5' })

    // 4) Oversized make-move payload triggers payload_too_large before game logic.
    client.emit('make-move', {
      requestId: 'req-6',
      action: 'play',
      // 25 cards => exceeds MAX_CARDS_PER_PLAY (=20)
      cards: Array.from({ length: 25 }, (_, i) => ({ type: 'standard', rank: String(i), suit: 'hearts' })),
    })

    // Allow async emissions to settle.
    await new Promise((r) => setTimeout(r, 800))

    // Assert at least one structured error happened (malformed payload + oversized payload).
    expect(errors.length).toBeGreaterThanOrEqual(1)

    // 5) Final responsiveness check: get-game-state should still work.
    players.set(socketId, { gameId: playingGameId, playerName: 'Player 1' })
    const requestId = 'req-final'
    client.emit('get-game-state', { reason: 'chaos-harness', requestId })

    await new Promise((resolve, reject) => {
      const start = Date.now()
      const tick = () => {
        const got = gameState.some((x) => x?.game?.id === playingGameId)
        if (got) return resolve()
        if (Date.now() - start > 3000) return reject(new Error('Timed out waiting for get-game-state'))
        setTimeout(tick, 20)
      }
      tick()
    })

    client.close()
    server.close()
    io.close()
  })
})

