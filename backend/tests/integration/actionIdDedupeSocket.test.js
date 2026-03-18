/**
 * Integration test for socket idempotency via actionId dedupe (A4).
 *
 * Validates that duplicate player commands with the same `actionId` do not
 * trigger a second authoritative state transition broadcast (`game-update`).
 */

const http = require('http')
const socketIo = require('socket.io')
const Client = require('socket.io-client')
const { setupSocketHandlers } = require('../../server/socketHandlers')

describe('Socket actionId dedupe (A4)', () => {
  jest.setTimeout(10000)

  test('duplicate declare-tichu with same actionId does not broadcast game-update twice', async () => {
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

    const gameId = 'game-test-actionid'
    const playerId = 'p1'
    const socketId = client.id

    // Minimal "playing" state that passes declareTichu() requirements.
    const game = {
      id: gameId,
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
      turnOrder: [{ id: playerId, team: 1, name: 'Player 1' }],

      // Containers expected by player view + wire snapshot sanitization.
      hands: {
        [playerId]: [{ type: 'standard', rank: 'A', suit: 'hearts' }],
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

      // Declaration-state requirements
      firstCardPlayed: { [playerId]: false },
      tichuDeclarations: {},
      grandTichuDeclarations: {},
      cardsRevealed: {},
      remainingCards: {},

      // Other fields referenced by getPlayerView/sanitizers
      exchangeCards: {},
      exchangeComplete: {},
      exchangeRecipients: [],
      deck: [],
      score: undefined,
      scores: { team1: 0, team2: 0 },
      exchangeSubmitted: false,
      playersOut: [],
      dogPriorityPlayer: null,
      mahJongWish: null,
      mahJongPlayed: false,
      firstCardPlayed: { [playerId]: false },
      playerStats: {},
      dragonPlayed: null,
      dragonOpponentSelection: null,
      winner: null,
    }

    // Ensure turnOrder has length >= 4 so declareTichu() doesn't reject "Invalid turn state".
    // (socketHandlers currently treats malformed turnOrder defensively, but declarations.js expects array.)
    game.turnOrder = [
      { id: playerId, team: 1, name: 'Player 1' },
      { id: 'p2', team: 1, name: 'Player 2' },
      { id: 'p3', team: 2, name: 'Player 3' },
      { id: 'p4', team: 2, name: 'Player 4' },
    ]

    games.set(gameId, game)
    players.set(socketId, { gameId, playerName: 'Player 1' })

    const actionId = 'action-dup-1'
    const requestId = 'req-1'

    const gameUpdateEvents = []
    const gameStateEvents = []

    client.on('game-update', (data) => gameUpdateEvents.push(data))
    client.on('game-state', (data) => gameStateEvents.push(data))

    client.emit('declare-tichu', { actionId, requestId })

    // Wait for first authoritative update.
    await new Promise((resolve, reject) => {
      const start = Date.now()
      const tick = () => {
        if (gameUpdateEvents.length >= 1) return resolve()
        if (Date.now() - start > 2500) return reject(new Error('Timed out waiting for first game-update'))
        setTimeout(tick, 20)
      }
      tick()
    })

    // Emit duplicate with same actionId: should NOT broadcast another game-update.
    client.emit('declare-tichu', { actionId, requestId: 'req-2' })

    await new Promise((r) => setTimeout(r, 500))

    expect(gameUpdateEvents.length).toBe(1)
    // Dedupe ok-branch replies with a game-state snapshot to the requesting client.
    expect(gameStateEvents.length).toBeGreaterThanOrEqual(1)

    client.close()
    server.close()
    io.close()
  })

  test('exchange-cards with malformed payload emits error and does not crash', async () => {
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

    const gameId = 'game-test-malformed-exchange'
    const playerId = 'p1'
    const socketId = client.id

    const game = {
      id: gameId,
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
        [playerId]: [
          { type: 'standard', rank: 'A', suit: 'hearts' },
          { type: 'standard', rank: 'K', suit: 'hearts' },
          { type: 'standard', rank: 'Q', suit: 'hearts' },
        ],
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
      firstCardPlayed: {},
      playerStats: {},
      dragonPlayed: null,
      dragonOpponentSelection: null,
      winner: null,
    }

    games.set(gameId, game)
    players.set(socketId, { gameId, playerName: 'Player 1' })

    const errors = []
    client.on('error', (data) => errors.push(data))

    client.emit('exchange-cards', { actionId: 'malformed-ex-1', requestId: 'req-1', cards: [null] })

    await new Promise((resolve, reject) => {
      const start = Date.now()
      const tick = () => {
        if (errors.length >= 1) return resolve()
        if (Date.now() - start > 2500) return reject(new Error('Timed out waiting for socket error'))
        setTimeout(tick, 20)
      }
      tick()
    })

    expect(errors[0]?.message).toMatch(/Must exchange exactly 3 cards|Invalid card element/)

    client.close()
    server.close()
    io.close()
  })

  test('duplicate exchange-cards with same actionId does not broadcast game-update twice', async () => {
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

    const gameId = 'game-test-exchange-dedupe'
    const playerId = 'p1'
    const socketId = client.id

    const c1 = { type: 'standard', rank: 'A', suit: 'hearts' }
    const c2 = { type: 'standard', rank: 'K', suit: 'hearts' }
    const c3 = { type: 'standard', rank: 'Q', suit: 'hearts' }

    const game = {
      id: gameId,
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

    games.set(gameId, game)
    players.set(socketId, { gameId, playerName: 'Player 1' })

    const actionId = 'exchange-dup-1'
    const requestId = 'req-1'

    const gameUpdateEvents = []
    const gameStateEvents = []
    client.on('game-update', (data) => gameUpdateEvents.push(data))
    client.on('game-state', (data) => gameStateEvents.push(data))

    client.emit('exchange-cards', { actionId, requestId, cards: [c1, c2, c3] })

    await new Promise((resolve, reject) => {
      const start = Date.now()
      const tick = () => {
        if (gameUpdateEvents.length >= 1) return resolve()
        if (Date.now() - start > 2500) return reject(new Error('Timed out waiting for first game-update'))
        setTimeout(tick, 20)
      }
      tick()
    })

    const countAfterFirst = gameUpdateEvents.length

    // Duplicate should not broadcast another game-update.
    client.emit('exchange-cards', { actionId, requestId: 'req-2', cards: [c1, c2, c3] })
    await new Promise((r) => setTimeout(r, 500))

    expect(gameUpdateEvents.length).toBe(countAfterFirst)
    expect(gameStateEvents.length).toBeGreaterThanOrEqual(1)

    client.close()
    server.close()
    io.close()
  })
})

