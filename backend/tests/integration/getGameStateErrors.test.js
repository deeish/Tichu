/**
 * get-game-state structured errors (server hardening P0).
 */

const http = require('http')
const socketIo = require('socket.io')
const Client = require('socket.io-client')
const { setupSocketHandlers } = require('../../server/socketHandlers')

describe('get-game-state errors', () => {
  jest.setTimeout(15000)

  test('emits not_in_game when socket is not in players map', async () => {
    const games = new Map()
    const players = new Map()
    const server = http.createServer()
    const io = socketIo(server, { cors: { origin: '*' } })
    setupSocketHandlers(io, games, players)

    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    const errPromise = new Promise((resolve) => {
      client.once('error', resolve)
    })

    client.emit('get-game-state', { requestId: 'test-req-1', reason: 'unit' })

    const err = await errPromise
    expect(err.code).toBe('not_in_game')
    expect(err.requestId).toBe('test-req-1')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })

  test('emits game_not_found when player.gameId missing from games', async () => {
    const games = new Map()
    const players = new Map()
    const server = http.createServer()
    const io = socketIo(server, { cors: { origin: '*' } })
    setupSocketHandlers(io, games, players)

    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    players.set(client.id, { gameId: 'NOPE', playerName: 'X', playerId: 'p1' })

    const errPromise = new Promise((resolve) => {
      client.once('error', resolve)
    })

    client.emit('get-game-state', { requestId: 'test-req-2' })

    const err = await errPromise
    expect(err.code).toBe('game_not_found')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })
})
