/**
 * In-game handlers emit structured errors instead of silent no-ops (P2c).
 */

const http = require('http')
const socketIo = require('socket.io')
const Client = require('socket.io-client')
const { setupSocketHandlers } = require('../../server/socketHandlers')

describe('gameplay handler prechecks (P2c)', () => {
  jest.setTimeout(15000)

  test('make-move emits not_in_game when socket is not in players map', async () => {
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

    client.emit('make-move', { cards: [], action: 'pass' })

    const err = await errPromise
    expect(err.code).toBe('not_in_game')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })

  test('make-move emits game_not_found when game row missing', async () => {
    const games = new Map()
    const players = new Map()
    const server = http.createServer()
    const io = socketIo(server, { cors: { origin: '*' } })
    setupSocketHandlers(io, games, players)

    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    const client = Client(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
    await new Promise((resolve) => client.on('connect', resolve))

    players.set(client.id, { gameId: 'ghost', playerName: 'X', playerId: 'p1' })

    const errPromise = new Promise((resolve) => {
      client.once('error', resolve)
    })

    client.emit('make-move', { cards: [], action: 'pass' })

    const err = await errPromise
    expect(err.code).toBe('game_not_found')

    client.close()
    await new Promise((resolve) => server.close(resolve))
  })
})
