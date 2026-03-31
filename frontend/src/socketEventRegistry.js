/**
 * Deterministic socket listener lifecycle for React StrictMode.
 *
 * React 18 dev StrictMode mounts, unmounts, and remounts components to detect
 * unsafe lifecycles. We must avoid:
 * - "dead zones" where handlers are removed before the next mount re-attaches
 * - duplicate handlers due to multiple mounts
 *
 * This module attaches stable delegator wrappers exactly once per socket
 * instance and uses a reference-count + delayed teardown to ensure safe
 * behavior during StrictMode fake unmounts.
 */

let refCount = 0
let teardownTimer = null
let installed = false
let latestHandlers = null

// Stable delegator functions so we can reliably `socket.off()` later.
function delegator(handlerName) {
  return (...args) => {
    try {
      const fn = latestHandlers?.[handlerName]
      if (typeof fn === 'function') return fn(...args)
    } catch (err) {
      // Last line of defense: never let socket callbacks crash the app.
      // (Most handler bodies already have try/catch.)
      // eslint-disable-next-line no-console
      console.error('[socketEventRegistry] handler failed', err)
    }
  }
}

const onConnect = delegator('onConnect')
const onDisconnect = delegator('onDisconnect')
const onGameCreated = delegator('onGameCreated')
const onPlayerJoined = delegator('onPlayerJoined')
const onGameStarted = delegator('onGameStarted')
const onGameUpdate = delegator('onGameUpdate')
const onGameState = delegator('onGameState')
const onPlayerWonRound = delegator('onPlayerWonRound')
const onTrickWon = delegator('onTrickWon')
const onPlayerLeft = delegator('onPlayerLeft')
const onError = delegator('onError')
const onConnectError = delegator('onConnectError')

function install(socket) {
  if (installed) return
  socket.on('connect', onConnect)
  socket.on('disconnect', onDisconnect)
  socket.on('connect_error', onConnectError)
  socket.on('game-created', onGameCreated)
  socket.on('player-joined', onPlayerJoined)
  socket.on('game-started', onGameStarted)
  socket.on('game-update', onGameUpdate)
  socket.on('game-state', onGameState)
  socket.on('player-won-round', onPlayerWonRound)
  socket.on('trick-won', onTrickWon)
  socket.on('player-left', onPlayerLeft)
  socket.on('error', onError)
  installed = true
}

function uninstall(socket) {
  if (!installed) return
  socket.off('connect', onConnect)
  socket.off('disconnect', onDisconnect)
  socket.off('game-created', onGameCreated)
  socket.off('player-joined', onPlayerJoined)
  socket.off('game-started', onGameStarted)
  socket.off('game-update', onGameUpdate)
  socket.off('game-state', onGameState)
  socket.off('player-won-round', onPlayerWonRound)
  socket.off('trick-won', onTrickWon)
  socket.off('player-left', onPlayerLeft)
  socket.off('error', onError)
  socket.off('connect_error', onConnectError)
  latestHandlers = null
  installed = false
}

/**
 * Subscribe to socket events with the provided latestHandlers object.
 * Returns an `unsubscribe()` function.
 */
function subscribe(socket, handlers) {
  latestHandlers = handlers
  refCount += 1
  if (teardownTimer) {
    clearTimeout(teardownTimer)
    teardownTimer = null
  }
  install(socket)

  let didUnsubscribe = false
  return () => {
    if (didUnsubscribe) return
    didUnsubscribe = true
    refCount -= 1
    if (refCount <= 0) {
      // Defer teardown so StrictMode fake-unmount followed by remount
      // in the same tick doesn't create a handler dead zone.
      teardownTimer = setTimeout(() => {
        teardownTimer = null
        if (refCount <= 0) uninstall(socket)
      }, 0)
    }
  }
}

export { subscribe }

