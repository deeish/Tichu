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

  test('emits already_in_game when same socket tries to rejoin an already-active session', async () => {
    const { games, server } = freshServer()
    // Player starts disconnected; first rejoin will set player.socketId = client socket id.
    // Second rejoin on the same socket triggers already_in_game.
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

    // First rejoin registers the client socket with the player (may succeed or emit internal_error
    // on the minimal game object — either way player.socketId is now set to this socket's id).
    await new Promise((resolve) => {
      client.once('game-state', resolve)
      client.once('error', resolve)
      client.emit('rejoin', { gameId: 'g1', playerToken: 'tok', requestId: 'r3' })
    })

    // Second rejoin on the same socket: player is now active on this socket → already_in_game.
    const err = await new Promise((resolve) => {
      client.once('error', resolve)
      client.emit('rejoin', { gameId: 'g1', playerToken: 'tok', requestId: 'r4' })
    })

    expect(err.code).toBe('already_in_game')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })
})
