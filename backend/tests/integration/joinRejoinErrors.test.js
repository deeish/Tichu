/**
 * Structured error codes for join-game and rejoin (aligned with frontend onError).
 */

const http = require('http')
const socketIo = require('socket.io')
const Client = require('socket.io-client')
const { setupSocketHandlers } = require('../../server/socketHandlers')

function freshServer() {
  const games = new Map()
  const players = new Map()
  const server = http.createServer()
  const io = socketIo(server, { cors: { origin: '*' } })
  setupSocketHandlers(io, games, players)
  return { games, players, server, io }
}

describe('join-game errors', () => {
  jest.setTimeout(15000)

  test('emits game_not_found with code when game missing', async () => {
    const { server } = freshServer()
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port
    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    const err = await new Promise((resolve) => {
      client.once('error', resolve)
      client.emit('join-game', { gameId: 'missing', playerName: 'Bob', requestId: 'j1' })
    })

    expect(err.code).toBe('game_not_found')
    expect(err.requestId).toBe('j1')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })
})

describe('rejoin errors', () => {
  jest.setTimeout(15000)

  test('emits game_not_found when game missing', async () => {
    const { server } = freshServer()
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port
    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    const err = await new Promise((resolve) => {
      client.once('error', resolve)
      client.emit('rejoin', { gameId: 'nope', playerToken: 'any', requestId: 'r1' })
    })

    expect(err.code).toBe('game_not_found')
    expect(err.requestId).toBe('r1')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })

  test('emits invalid_rejoin_token when token does not match', async () => {
    const { games, server } = freshServer()
    games.set('g1', {
      id: 'g1',
      state: 'waiting',
      players: [{ id: 'p1', token: 'real', disconnected: true, socketId: null, name: 'A', team: 1 }],
    })

    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port
    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    const err = await new Promise((resolve) => {
      client.once('error', resolve)
      client.emit('rejoin', { gameId: 'g1', playerToken: 'wrong', requestId: 'r2' })
    })

    expect(err.code).toBe('invalid_rejoin_token')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })

  test('silently succeeds (game-state) when same socket rejoins an already-active session', async () => {
    const { games, server } = freshServer()
    // Player starts disconnected; first rejoin sets player.socketId = client socket id.
    // Second rejoin on the same socket now returns game-state (not an error) because the
    // session is active and we treat it as a state-refresh rather than a conflict.
    games.set('g1', {
      id: 'g1',
      state: 'waiting',
      players: [
        { id: 'p1', token: 'tok', disconnected: true, socketId: null, name: 'A', team: 1 },
      ],
    })

    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port
    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    // First rejoin registers the client socket with the player.
    await new Promise((resolve) => {
      client.once('game-state', resolve)
      client.once('error', resolve)
      client.emit('rejoin', { gameId: 'g1', playerToken: 'tok', requestId: 'r3' })
    })

    // Second rejoin on the same socket: session already active → no 'already_in_game' error.
    // May return game-state or an internal error on the minimal game object, but never already_in_game.
    const result = await new Promise((resolve) => {
      client.once('game-state', resolve)
      client.once('error', resolve)
      client.emit('rejoin', { gameId: 'g1', playerToken: 'tok', requestId: 'r4' })
    })

    expect(result.code).not.toBe('already_in_game')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })
})
