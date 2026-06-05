import { useState, useEffect, useRef, useCallback, startTransition } from 'react'
import { Link } from 'react-router-dom'
import { socket } from './socket'
import { subscribe as subscribeSocketEvents } from './socketEventRegistry'
import GameBoard from './components/GameBoard'
import GameErrorBoundary from './components/GameErrorBoundary'
import StatsPopup from './components/StatsPopup'
import { reportClientError, setClientCorrelation, showGlobalCrashOverlay } from './clientErrorReport'
import { normalizeGameState } from './utils/normalizeGameState'
import {
  LANDING_UPDATE_DAYS,
  getLastUpdatedDisplayDate,
  formatUpdateDayHeading,
  landingUpdateKindLabel,
} from './data/landingUpdates'
import './App.css'

const REJOIN_GAME_KEY = 'tichu_rejoin_gameId'
const REJOIN_TOKEN_KEY = 'tichu_rejoin_token'
const EXPECTED_PROTOCOL_VERSION = 1

// Read synchronously at module load — before React effects or the socket fire — so that
// onConnect can skip auto-rejoin when the user landed from an invite link.
const INVITE_JOIN_CODE = new URLSearchParams(window.location.search).get('join') || null

/** Prefer socket match: token-based find(p => p.token) can mis-identify when multiple tokens leak or order differs. */
function findMyPlayerInWireSnapshot(players, socketId) {
  if (!Array.isArray(players) || !socketId) return undefined
  return players.find((p) => p.socketId === socketId) ?? players.find((p) => p.token)
}

/** Opt-in: set VITE_DEBUG_GAME_SYNC=true or localStorage tichu_debug_game_sync=1 — logs stale snapshot drops (H-B1/H-B4). */
function isDebugGameSync() {
  try {
    if (import.meta.env?.VITE_DEBUG_GAME_SYNC === 'true') return true
    if (typeof localStorage !== 'undefined' && localStorage.getItem('tichu_debug_game_sync') === '1') return true
  } catch (_) {}
  return false
}

/** Throttle game-update apply so we clone + setState at most this often (reduces re-renders and churn). */
const GAME_UPDATE_THROTTLE_MS = 90

/** Render-loop guard: if this many commits in RENDER_LOOP_WINDOW_MS we show crash overlay (infinite re-render protection). */
const RENDER_LOOP_THRESHOLD = 200
const RENDER_LOOP_WINDOW_MS = 2000

function saveRejoinCreds(gameId, playerToken) {
  if (gameId && playerToken) {
    try {
      localStorage.setItem(REJOIN_GAME_KEY, gameId)
      localStorage.setItem(REJOIN_TOKEN_KEY, playerToken)
    } catch (_) {}
  }
}

function clearRejoinCreds() {
  try {
    localStorage.removeItem(REJOIN_GAME_KEY)
    localStorage.removeItem(REJOIN_TOKEN_KEY)
  } catch (_) {}
}

// Mock game in finished state for testing the end game screen
const MOCK_FINISHED_GAME = {
  id: 'ENDGAME-TEST',
  state: 'finished',
  winner: 1,
  players: [
    { id: 'p1', name: 'Test Player', team: 2 },
    { id: 'p2', name: 'Test Player 2', team: 1 },
    { id: 'p3', name: 'Test Player 3', team: 2 },
    { id: 'p4', name: 'Test Player 4', team: 1 },
  ],
  turnOrder: [
    { id: 'p1', name: 'Test Player', team: 2 },
    { id: 'p2', name: 'Test Player 2', team: 1 },
    { id: 'p3', name: 'Test Player 3', team: 2 },
    { id: 'p4', name: 'Test Player 4', team: 1 },
  ],
  scores: { team1: 1015, team2: 785 },
  roundScores: { team1: 215, team2: -15 },
  currentPlayerIndex: 0,
  handCounts: {},
  playerStacks: {},
  playerStats: {
    p1: { dog: 2, phoenix: 1, dragon: 0, mahJong: 3, bombs: 1, points: 145, firstPlace: 2, lastPlace: 0, tichuCalls: 3, tichuWins: 2, grandCalls: 1, grandWins: 0 },
    p2: { dog: 1, phoenix: 0, dragon: 2, mahJong: 1, bombs: 2, points: 220, firstPlace: 3, lastPlace: 1, tichuCalls: 2, tichuWins: 2, grandCalls: 2, grandWins: 1 },
    p3: { dog: 0, phoenix: 2, dragon: 1, mahJong: 2, bombs: 0, points: 85, firstPlace: 1, lastPlace: 2, tichuCalls: 4, tichuWins: 1, grandCalls: 0, grandWins: 0 },
    p4: { dog: 1, phoenix: 1, dragon: 1, mahJong: 0, bombs: 1, points: 0, firstPlace: 0, lastPlace: 3, tichuCalls: 0, tichuWins: 0, grandCalls: 1, grandWins: 0 },
  },
}

function App() {
  const [gameState, setGameState] = useState(null)
  const [gameStateVersion, setGameStateVersion] = useState(0)
  const [resyncVersion, setResyncVersion] = useState(0)
  const [protocolMismatch, setProtocolMismatch] = useState(false)
  const setGameStateRef = useRef(setGameState)
  setGameStateRef.current = setGameState
  const pendingGameRef = useRef(null)
  const flushTimerRef = useRef(null)
  const cloneWorkerRef = useRef(null)
  const cloneSeqRef = useRef(0)
  const pendingCloneApplyRef = useRef(null)
  const autoResyncRef = useRef({ attempts: 0, lastRequestAt: 0 })
  const lastAppliedServerStateVersionRef = useRef(-1)
  const requestSeqRef = useRef(0)
  const pendingRejoinRef = useRef({ gameId: null, timerId: null, resolved: false })
  const hiddenAtRef = useRef(null)
  const nextRequestId = () => {
    requestSeqRef.current += 1
    return `${Date.now()}-${requestSeqRef.current}`
  }

  // Infinite re-render guard: if we commit 200+ times in 2s show crash overlay (setState-in-render / effect loop protection).
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  useEffect(() => {
    const id = setInterval(() => {
      if (renderCountRef.current > RENDER_LOOP_THRESHOLD) {
        showGlobalCrashOverlay()
        reportClientError({ source: 'render-loop-guard', message: `Possible infinite re-render (${renderCountRef.current} in ${RENDER_LOOP_WINDOW_MS}ms)` })
      }
      renderCountRef.current = 0
    }, RENDER_LOOP_WINDOW_MS)
    return () => clearInterval(id)
  }, [])

  // Memory exhaustion guard: when in a game, if JS heap > 150MB (Chrome) report once so user can refresh before tab dies.
  const highMemoryReportedRef = useRef(false)
  useEffect(() => {
    if (!gameState) {
      highMemoryReportedRef.current = false
      return
    }
    const id = setInterval(() => {
      try {
        if (highMemoryReportedRef.current) return
        if (typeof performance !== 'undefined' && performance.memory && performance.memory.usedJSHeapSize > 150 * 1024 * 1024) {
          highMemoryReportedRef.current = true
          reportClientError({ source: 'memory', message: 'High JS heap (>150MB) - refresh if the game is slow' })
        }
      } catch (_) {}
    }, 60_000)
    return () => clearInterval(id)
  }, [gameState])

  // When we successfully resync (we receive a fresh `game-state`), reset backoff so the next
  // desync can be handled immediately.
  useEffect(() => {
    autoResyncRef.current.attempts = 0
    autoResyncRef.current.lastRequestAt = 0
  }, [resyncVersion])
  useEffect(() => {
    // Clear the mismatch banner when we successfully applied a fresh state.
    setProtocolMismatch(false)
  }, [resyncVersion])

  const [playerName, setPlayerName] = useState('')
  const [gameId, setGameId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [rejoinPending, setRejoinPending] = useState(false)
  const [playerId, setPlayerId] = useState(null)
  const [showEndGameTest, setShowEndGameTest] = useState(false)
  const [showStatsPopup, setShowStatsPopup] = useState(false)
  const [toasts, setToasts] = useState([])
  const toastTimersRef = useRef(new Map())
  // 'start' | 'join' | null — null = show only the two main buttons
  const [landingMode, setLandingMode] = useState(null)
  // Lobby: editing own name (show input + save)
  const [editingMyName, setEditingMyName] = useState(false)
  const [lobbyNameDraft, setLobbyNameDraft] = useState('')
  const [lobbyCustomScoreOpen, setLobbyCustomScoreOpen] = useState(false)
  const [lobbyStartingTeam1, setLobbyStartingTeam1] = useState('')
  const [lobbyStartingTeam2, setLobbyStartingTeam2] = useState('')
  const [showLandingUpdates, setShowLandingUpdates] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  useEffect(() => {
    setLobbyCustomScoreOpen(false)
    setLobbyStartingTeam1('')
    setLobbyStartingTeam2('')
    setInviteCopied(false)
  }, [gameState?.id])

  useEffect(() => {
    if (gameState) setShowLandingUpdates(false)
  }, [gameState])

  useEffect(() => {
    if (!showLandingUpdates) return
    const onKey = (e) => {
      if (e.key === 'Escape') setShowLandingUpdates(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showLandingUpdates])

  useEffect(() => {
    if (INVITE_JOIN_CODE) {
      setGameId(INVITE_JOIN_CODE)
      setLandingMode('join')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = toastTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message, level = 'error') => {
    const text = String(message || '').trim()
    if (!text) return
    const now = Date.now()
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => {
      const last = prev[0]
      // De-dupe fast repeats from rapid retries/socket bursts.
      if (last && last.message === text && now - last.createdAt < 1200) return prev
      return [{ id, message: text, level, createdAt: now }, ...prev].slice(0, 4)
    })
    const timer = setTimeout(() => dismissToast(id), 4200)
    toastTimersRef.current.set(id, timer)
  }, [dismissToast])

  // Pre-fill name on Join Party from last saved name (only if it looks like a real name: 2+ chars)
  useEffect(() => {
    if (landingMode === 'join') {
      try {
        const saved = localStorage.getItem('tichu-player-name')
        const trimmed = saved != null ? String(saved).trim() : ''
        if (trimmed.length >= 2 && !playerName.trim()) setPlayerName(trimmed)
      } catch (_) {}
    }
  }, [landingMode])

  useEffect(() => {
    let unsubscribe = null

    try {
      const w = new Worker(new URL('./gameStateClone.worker.js', import.meta.url))
      w.onmessage = (e) => {
        const d = e?.data
        if (d?.requestId !== cloneSeqRef.current) return
        const pending = pendingCloneApplyRef.current
        pendingCloneApplyRef.current = null
        if (!pending) return
        const safeApply = (g) => {
          try {
            pending.apply(g)
          } catch (err) {
            console.error('[clone worker] apply failed', err)
            if (pending.normalized != null) pending.apply(pending.normalized)
          }
        }
        if (d?.type === 'result' && d.game != null) {
          startTransition(() => safeApply(d.game))
        } else if (d?.type === 'error' && pending.normalized != null) {
          startTransition(() => safeApply(pending.normalized))
        }
      }
      w.onerror = () => {
        const pending = pendingCloneApplyRef.current
        pendingCloneApplyRef.current = null
        if (pending?.normalized != null) {
          startTransition(() => {
            try {
              pending.apply(pending.normalized)
            } catch (err) {
              console.error('[clone worker] onerror fallback apply failed', err)
            }
          })
        }
      }
      cloneWorkerRef.current = w
    } catch (_) {
      cloneWorkerRef.current = null
    }

    const handlers = {
      onConnect: () => {
        setIsConnected(true)
        const savedGameId = localStorage.getItem(REJOIN_GAME_KEY)
        const savedToken = localStorage.getItem(REJOIN_TOKEN_KEY)
        if (savedGameId && savedToken && !INVITE_JOIN_CODE) {
          // Token-based reconnect: if `rejoin` response doesn't arrive (or is dropped),
          // fall back to explicit `get-game-state` so recovery is deterministic.
          if (pendingRejoinRef.current.timerId) clearTimeout(pendingRejoinRef.current.timerId)
          pendingRejoinRef.current = { gameId: savedGameId, timerId: null, resolved: false }
          const requestId = nextRequestId()
          setClientCorrelation({ requestId })
          setRejoinPending(true)
          socket.emit('rejoin', { gameId: savedGameId, playerToken: savedToken, requestId }, (ack) => {
            // Ack fires only after server has called players.set() — safe to enable play.
            pendingRejoinRef.current.resolved = true
            if (pendingRejoinRef.current.timerId) {
              clearTimeout(pendingRejoinRef.current.timerId)
              pendingRejoinRef.current.timerId = null
            }
            setRejoinPending(false)
            if (ack?.error === 'game_not_found' || ack?.error === 'invalid_rejoin_token') {
              clearRejoinCreds()
              setGameState(null)
              setGameId('')
            }
          })
          pendingRejoinRef.current.timerId = setTimeout(() => {
            if (pendingRejoinRef.current.resolved) return
            pendingRejoinRef.current.resolved = true
            pendingRejoinRef.current.timerId = null
            setRejoinPending(false)
            // Ack didn't arrive — zombie socket or very slow network. Reload so the fresh
            // page gets a clean socket (engine.close() silently fails on frozen iOS WebSockets).
            window.location.reload()
          }, 12_000)
        }
        console.log('Connected to server')
      },
      onDisconnect: () => {
        try { setIsConnected(false) } catch (e) { console.error('[disconnect]', e); reportClientError({ source: 'disconnect', message: e?.message }) }
        setRejoinPending(false)
        if (pendingRejoinRef.current.timerId) {
          clearTimeout(pendingRejoinRef.current.timerId)
        }
        pendingRejoinRef.current = { gameId: null, timerId: null, resolved: false }
      },
      onGameCreated: (data) => {
        try {
          startTransition(() => {
          const game = data?.game ? normalizeGameState(data.game, { reportError: reportClientError }) : data.game
            if (typeof game?.stateVersion === 'number') lastAppliedServerStateVersionRef.current = game.stateVersion
            setGameState(game)
            setGameId(data.gameId)
            const me = findMyPlayerInWireSnapshot(data.game?.players, socket.id)
            const myId = me?.id ?? socket.id
            setPlayerId(myId)
            if (data.playerToken) saveRejoinCreds(data.gameId, data.playerToken)
          })
        } catch (e) {
          console.error('[game-created]', e); reportClientError({ source: 'game-created', message: e?.message ?? String(e), stack: e?.stack })
        }
      },
      onPlayerJoined: (data) => {
        try {
          startTransition(() => {
          const game = data?.game ? normalizeGameState(data.game, { reportError: reportClientError }) : data.game
            if (typeof game?.stateVersion === 'number') lastAppliedServerStateVersionRef.current = game.stateVersion
            setGameState(game)
            const gid = data.gameId ?? data.game?.id
            setGameId(gid)
            const me = findMyPlayerInWireSnapshot(data.game?.players, socket.id)
            const myId = me?.id ?? socket.id
            setPlayerId(myId)
            if (data.playerToken && gid) saveRejoinCreds(gid, data.playerToken)
          })
        } catch (e) {
          console.error('[player-joined]', e); reportClientError({ source: 'player-joined', message: e?.message ?? String(e), stack: e?.stack })
        }
      },
      onGameStarted: (data) => {
        try {
          startTransition(() => {
          const game = data?.game ? normalizeGameState(data.game, { reportError: reportClientError }) : data.game
            if (typeof game?.stateVersion === 'number') lastAppliedServerStateVersionRef.current = game.stateVersion
            setGameState(game)
          })
        } catch (e) {
          console.error('[game-started]', e); reportClientError({ source: 'game-started', message: e?.message ?? String(e), stack: e?.stack })
        }
      },
      onGameUpdate: (data) => {
        try {
          const game = data?.game
          if (game && typeof game === 'object') {
            if (typeof game?.protocolVersion === 'number' && game.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
              setProtocolMismatch(true)
              handleResyncGame('protocol-mismatch')
              return
            }
            const incomingVersion = typeof game?.stateVersion === 'number' ? game.stateVersion : null
            if (incomingVersion != null && incomingVersion <= lastAppliedServerStateVersionRef.current) {
              if (isDebugGameSync()) {
                console.warn('[game-sync] game-update dropped as stale', {
                  incomingVersion,
                  lastApplied: lastAppliedServerStateVersionRef.current,
                  state: game.state,
                })
              }
              return
            }
            pendingGameRef.current = game
            const hasPlays = Array.isArray(game.currentTrick) && game.currentTrick.length > 0
            const me = findMyPlayerInWireSnapshot(game.players, socket.id)
            const myId = me?.id
            const playerWentOut = myId && Array.isArray(game.hands?.[myId]) && game.hands[myId].length === 0
            // Throttle only in lobby; during play/exchange/etc. delayed apply can drop passes or trick resolution.
            const applyImmediately =
              game.state !== 'waiting' || hasPlays || playerWentOut
            if (applyImmediately) {
              if (flushTimerRef.current != null) {
                clearTimeout(flushTimerRef.current)
                flushTimerRef.current = null
              }
              pendingGameRef.current = null
            const normalized = normalizeGameState(game, { reportError: reportClientError })
              if (typeof game?.stateVersion === 'number') lastAppliedServerStateVersionRef.current = game.stateVersion
              const applyGameUpdate = (g) => {
                setGameStateRef.current(g)
                const foundMe = findMyPlayerInWireSnapshot(g.players, socket.id)
                if (foundMe?.id) setPlayerId(foundMe.id)
              }
              if (cloneWorkerRef.current) {
                cloneSeqRef.current += 1
                pendingCloneApplyRef.current = { apply: applyGameUpdate, normalized }
                try {
                  cloneWorkerRef.current.postMessage({ type: 'clone', json: JSON.stringify(normalized), requestId: cloneSeqRef.current })
                } catch (_) {
                  pendingCloneApplyRef.current = null
                  startTransition(() => applyGameUpdate(normalized))
                }
              } else {
                startTransition(() => applyGameUpdate(normalized))
              }
              return
            }
            if (flushTimerRef.current == null) {
              flushTimerRef.current = setTimeout(() => {
                const pending = pendingGameRef.current
                pendingGameRef.current = null
                flushTimerRef.current = null
                if (pending && typeof pending === 'object') {
                  try {
                    const normalized = normalizeGameState(pending, { reportError: reportClientError })
                    if (typeof pending?.stateVersion === 'number') lastAppliedServerStateVersionRef.current = pending.stateVersion
                    const applyGameUpdate = (g) => {
                      setGameStateRef.current(g)
                      const me = findMyPlayerInWireSnapshot(g.players, socket.id)
                      if (me?.id) setPlayerId(me.id)
                    }
                    if (cloneWorkerRef.current) {
                      cloneSeqRef.current += 1
                      pendingCloneApplyRef.current = { apply: applyGameUpdate, normalized }
                      try {
                        cloneWorkerRef.current.postMessage({ type: 'clone', json: JSON.stringify(normalized), requestId: cloneSeqRef.current })
                      } catch (_) {
                        pendingCloneApplyRef.current = null
                        startTransition(() => applyGameUpdate(normalized))
                      }
                    } else {
                      startTransition(() => applyGameUpdate(normalized))
                    }
                  } catch (err) {
                    console.error('[game-update] throttle apply failed', err)
                    reportClientError({ source: 'game-update', message: err?.message ?? String(err), stack: err?.stack })
                  }
                }
              }, GAME_UPDATE_THROTTLE_MS)
            }
          } else if (game && typeof game === 'object') {
            // Malformed payload but object: still normalize and apply so we never set broken shape (crash prevention).
            startTransition(() => {
              try {
            setGameStateRef.current(normalizeGameState(game, { reportError: reportClientError }))
              } catch (err) {
                console.error('[game-update] normalize/apply failed', err)
                reportClientError({ source: 'game-update', message: err?.message ?? String(err), stack: err?.stack })
              }
            })
          }
        } catch (err) {
          console.error('[game-update] handler failed', err)
          reportClientError({ source: 'game-update', message: err?.message ?? String(err), stack: err?.stack })
        }
      },
      onGameState: (data) => {
        try {
          if (!data?.game || !Array.isArray(data.game?.players)) return
          if (pendingRejoinRef.current.gameId && data.game?.id === pendingRejoinRef.current.gameId) {
            pendingRejoinRef.current.resolved = true
            if (pendingRejoinRef.current.timerId) clearTimeout(pendingRejoinRef.current.timerId)
            pendingRejoinRef.current.timerId = null
          }
          if (typeof data?.game?.protocolVersion === 'number' && data.game.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
            setProtocolMismatch(true)
            handleResyncGame('protocol-mismatch')
            return
          }
          // Save credentials before the stale-version check so a game-update/game-state
          // version tie (both carry V+1) doesn't silently lose the rejoin token.
          const earlyMe = findMyPlayerInWireSnapshot(data.game.players, socket.id)
          if (earlyMe?.token && data.game.id) {
            saveRejoinCreds(data.game.id, earlyMe.token)
          }
          const incomingVersion = typeof data?.game?.stateVersion === 'number' ? data.game.stateVersion : null
          if (incomingVersion != null && incomingVersion <= lastAppliedServerStateVersionRef.current) {
            if (isDebugGameSync()) {
              console.warn('[game-sync] game-state dropped as stale', {
                incomingVersion,
                lastApplied: lastAppliedServerStateVersionRef.current,
                state: data.game?.state,
              })
            }
            return
          }
          if (flushTimerRef.current != null) {
            clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
          }
          pendingGameRef.current = null
          const payload = data.game
          const normalized = normalizeGameState(payload, { reportError: reportClientError })
          const applyGameState = (g) => {
            if (typeof g?.stateVersion === 'number') lastAppliedServerStateVersionRef.current = g.stateVersion
            const me = findMyPlayerInWireSnapshot(g.players, socket.id)
            if (me && g.id) {
              saveRejoinCreds(g.id, me.token)
              setPlayerId(me.id)
              setGameId(g.id)
            }
            setGameStateRef.current(g)
            setGameStateVersion((v) => v + 1)
            setResyncVersion((v) => v + 1)
          }
          if (cloneWorkerRef.current) {
            cloneSeqRef.current += 1
            pendingCloneApplyRef.current = { apply: applyGameState, normalized }
            try {
              cloneWorkerRef.current.postMessage({ type: 'clone', json: JSON.stringify(normalized), requestId: cloneSeqRef.current })
            } catch (_) {
              pendingCloneApplyRef.current = null
              startTransition(() => applyGameState(normalized))
            }
          } else {
            startTransition(() => applyGameState(normalized))
          }
        } catch (e) {
          console.error('[game-state]', e); reportClientError({ source: 'game-state', message: e?.message ?? String(e), stack: e?.stack })
        }
      },
      onPlayerWonRound: () => {},
      onTrickWon: () => {
        // Do NOT request get-game-state here: the winner often leads immediately; a delayed
        // game-state response (empty trick) would overwrite their lead play and show "No cards played yet".
        // Use the sidebar "Resync" button or error fallback "Sync game" if something looks wrong.
      },
      onPlayerLeft: (data) => {
        try {
          startTransition(() => {
          const game = data?.game ? normalizeGameState(data.game, { reportError: reportClientError }) : data.game
            setGameState(game)
          })
        } catch (e) {
          console.error('[player-left]', e); reportClientError({ source: 'player-left', message: e?.message ?? String(e), stack: e?.stack })
        }
      },
      onError: (data) => {
        try {
          const msg = data?.message ?? ''
          const code = data?.code
          if (code === 'not_in_game') {
            // Server doesn't have this socket registered — likely the rejoin ack was slow
            // and the user tapped before it arrived. Silently retry rejoin if credentials exist.
            const savedGameId = localStorage.getItem(REJOIN_GAME_KEY)
            const savedToken = localStorage.getItem(REJOIN_TOKEN_KEY)
            const noActiveRejoin = !pendingRejoinRef.current.gameId || pendingRejoinRef.current.resolved
            if (savedGameId && savedToken && socket.connected && !noActiveRejoin) {
              // Rejoin already in-flight from onConnect — its 2500ms timer will reload if ack never arrives.
              return
            }
            if (savedGameId && savedToken && socket.connected && noActiveRejoin) {
              pendingRejoinRef.current = { gameId: savedGameId, timerId: null, resolved: false }
              setRejoinPending(true)
              socket.emit('rejoin', { gameId: savedGameId, playerToken: savedToken, requestId: nextRequestId() }, (ack) => {
                if (pendingRejoinRef.current.timerId) {
                  clearTimeout(pendingRejoinRef.current.timerId)
                  pendingRejoinRef.current.timerId = null
                }
                setRejoinPending(false)
                pendingRejoinRef.current.resolved = true
                if (ack?.error === 'game_not_found' || ack?.error === 'invalid_rejoin_token') {
                  clearRejoinCreds()
                  setGameState(null)
                  setGameId('')
                }
              })
              pendingRejoinRef.current.timerId = setTimeout(() => {
                if (pendingRejoinRef.current.resolved) return
                pendingRejoinRef.current.resolved = true
                pendingRejoinRef.current.timerId = null
                setRejoinPending(false)
                // engine.close() silently fails on frozen iOS WebSockets; reload instead.
                window.location.reload()
              }, 12_000)
              return
            }
          }
          if (
            msg.includes('rejoin') ||
            msg === 'Game not found' ||
            msg === 'Invalid rejoin token' ||
            code === 'game_not_found' ||
            code === 'invalid_rejoin_token'
          ) {
            clearRejoinCreds()
          }
          showToast((data?.message ?? msg) || 'Unexpected error')
        } catch (e) {
          console.error('[socket error handler]', e); reportClientError({ source: 'socket-error', message: e?.message ?? String(e) })
        }
      },
    }

    // iOS Safari freezes WebSockets when the app is backgrounded — requires explicit
    // disconnect/reconnect. Desktop browsers and Android keep the socket alive across
    // tab switches, so we must NOT force-disconnect there or we cause the very bug
    // we're trying to prevent.
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    const handlePageHide = () => {
      if (!isIOS) return
      socket.disconnect()
      try { localStorage.setItem('tichu_hidden_at', String(Date.now())) } catch(_) {}
    }

    // pageshow(persisted=true) fires on bfcache restore on all platforms — safe to reconnect here.
    const handlePageShow = (e) => {
      if (!e.persisted) return
      const storedAt = localStorage.getItem('tichu_hidden_at')
      try { localStorage.removeItem('tichu_hidden_at') } catch(_) {}
      const hiddenMs = storedAt
        ? Date.now() - Number(storedAt)
        : hiddenAtRef.current
          ? Date.now() - hiddenAtRef.current
          : Infinity
      hiddenAtRef.current = null
      if (hiddenMs > 300_000) {
        window.location.reload()
        return
      }
      socket.connect()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        // Desktop tab switches: just record the time, leave the socket alone.
        // iOS: disconnect so the frozen WebSocket can be cleanly replaced on return.
        if (!isIOS) return
        try { localStorage.setItem('tichu_hidden_at', String(hiddenAtRef.current)) } catch(_) {}
        socket.disconnect()
        return
      }
      // Becoming visible — only act on iOS; desktop socket is still live.
      if (!isIOS) {
        hiddenAtRef.current = null
        return
      }
      const storedAt = localStorage.getItem('tichu_hidden_at')
      try { localStorage.removeItem('tichu_hidden_at') } catch(_) {}
      const hiddenMs = hiddenAtRef.current
        ? Date.now() - hiddenAtRef.current
        : storedAt ? Date.now() - Number(storedAt) : 0
      hiddenAtRef.current = null
      if (hiddenMs > 300_000) {
        window.location.reload()
        return
      }
      const savedGameId = localStorage.getItem(REJOIN_GAME_KEY)
      const savedToken = localStorage.getItem(REJOIN_TOKEN_KEY)
      if (!savedGameId || !savedToken) return
      if (!socket.connected) {
        socket.connect()
        return
      }
      // Already rejoining? Don't double-emit.
      if (pendingRejoinRef.current.gameId && !pendingRejoinRef.current.resolved) return
      if (pendingRejoinRef.current.timerId) {
        clearTimeout(pendingRejoinRef.current.timerId)
        pendingRejoinRef.current.timerId = null
      }
      pendingRejoinRef.current = { gameId: savedGameId, timerId: null, resolved: false }
      setRejoinPending(true)
      const visRequestId = nextRequestId()
      socket.emit('rejoin', { gameId: savedGameId, playerToken: savedToken, requestId: visRequestId }, (ack) => {
        pendingRejoinRef.current.resolved = true
        if (pendingRejoinRef.current.timerId) {
          clearTimeout(pendingRejoinRef.current.timerId)
          pendingRejoinRef.current.timerId = null
        }
        setRejoinPending(false)
        if (ack?.error === 'game_not_found' || ack?.error === 'invalid_rejoin_token') {
          clearRejoinCreds()
          setGameState(null)
          setGameId('')
        }
      })
      pendingRejoinRef.current.timerId = setTimeout(() => {
        if (pendingRejoinRef.current.resolved) return
        pendingRejoinRef.current.resolved = true
        pendingRejoinRef.current.timerId = null
        setRejoinPending(false)
        window.location.reload()
      }, 12_000)
    }

    // If device comes back online while disconnected, force reconnect so onConnect handles rejoin.
    const handleNetworkOnline = () => {
      if (!socket.connected) socket.connect()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('online', handleNetworkOnline)

    if (socket.connected) handlers.onConnect()
    unsubscribe = subscribeSocketEvents(socket, handlers)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('online', handleNetworkOnline)
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      pendingGameRef.current = null
      pendingCloneApplyRef.current = null
      if (cloneWorkerRef.current) {
        cloneWorkerRef.current.terminate()
        cloneWorkerRef.current = null
      }
      if (unsubscribe) unsubscribe()
      for (const timer of toastTimersRef.current.values()) clearTimeout(timer)
      toastTimersRef.current.clear()
    }
  }, [showToast])

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      showToast('Please enter your name', 'warning')
      return
    }
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    try {
      localStorage.setItem('tichu-player-name', playerName.trim())
    } catch (_) {}
    socket.emit('create-game', { playerName, requestId })
  }

  const handleJoinGame = () => {
    if (!gameId.trim()) {
      showToast('Please enter the party code', 'warning')
      return
    }
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    const name = playerName.trim() || 'Player'
    try {
      localStorage.setItem('tichu-player-name', name)
    } catch (_) {}
    socket.emit('join-game', { gameId, playerName: name, requestId })
  }

  const handleLeaveParty = () => {
    clearRejoinCreds()
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    socket.emit('leave-game', { requestId })
    setGameState(null)
    setGameId('')
  }

  const handleStartGame = () => {
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    /** Match server: 0–999, then nearest multiple of 5; 1000 → 995 */
    const snapStartingScore = (s) => {
      const t = String(s ?? '').trim()
      if (t === '') return 0
      const n = parseInt(t, 10)
      if (!Number.isFinite(n)) return 0
      let x = Math.max(0, Math.min(999, n))
      x = Math.round(x / 5) * 5
      if (x >= 1000) x = 995
      return x
    }
    const team1 = lobbyCustomScoreOpen ? snapStartingScore(lobbyStartingTeam1) : 0
    const team2 = lobbyCustomScoreOpen ? snapStartingScore(lobbyStartingTeam2) : 0
    socket.emit('start-game', {
      requestId,
      startingScores: { team1, team2 },
    })
  }

  const myId = playerId ?? socket?.id

  const isMe = (player) => {
    if (!player || (!myId && !socket?.id)) return false
    const id = player.id ?? player.socketId
    return id === myId || id === socket?.id || player.socketId === socket?.id
  }

  const setMyTeam = (team) => {
    if (team !== 1 && team !== 2) return
    const sid = socket?.id ?? myId
    if (!sid) return
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    socket.emit('set-player-team', { team: Number(team), requestId })
    setGameState((prev) => {
      if (!prev?.players) return prev
      return {
        ...prev,
        players: prev.players.map((p) => (isMe(p) ? { ...p, team: Number(team) } : p)),
      }
    })
  }

  const handleRandomizeTeams = () => {
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    socket.emit('randomize-teams', { requestId })
  }

  const startEditMyName = () => {
    const me = gameState?.players?.find(isMe)
    if (me) {
      setLobbyNameDraft(me.name || '')
      setEditingMyName(true)
    }
  }

  const saveMyName = () => {
    const name = lobbyNameDraft.trim() || 'Player'
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    socket.emit('update-player-name', { name, requestId })
    setEditingMyName(false)
    setGameState((prev) => {
      if (!prev?.players || !myId) return prev
      return {
        ...prev,
        players: prev.players.map((p) => (p.id === myId ? { ...p, name } : p)),
      }
    })
  }

  const cancelEditMyName = () => {
    setEditingMyName(false)
  }

  const handleTestGame = () => {
    const name = playerName.trim() || 'You'
    const requestId = nextRequestId()
    setClientCorrelation({ requestId })
    socket.emit('create-test-game', { playerName: name, requestId })
  }

  const renderToasts = () => (
    <div className="toast-stack" role="status" aria-live="assertive" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.level}`}>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )

  // Only show game board when game has actually started (host clicked Start game).
  // Stay in lobby for 'waiting' or any unexpected state so joiners never see the game until host starts.
  const ACTIVE_GAME_STATES = ['grand-tichu', 'exchanging', 'playing', 'round-ending-preview', 'round-ended', 'finished']
  const inActiveGame = gameState && ACTIVE_GAME_STATES.includes(gameState.state)

  if (showEndGameTest) {
    return (
      <div className="end-game-test-wrap">
        <GameErrorBoundary onError={(payload) => reportClientError(payload)}>
          <GameBoard
          game={MOCK_FINISHED_GAME}
          socket={socket}
          playerId={playerId || 'p1'}
          isConnected={true}
        />
        <button
          type="button"
          className="end-game-test-back"
          onClick={() => setShowEndGameTest(false)}
        >
          ← Back to lobby
        </button>
        <button
          type="button"
          className="end-game-test-stats"
          onClick={() => setShowStatsPopup(true)}
        >
          View stats
        </button>
        <StatsPopup
          open={showStatsPopup}
          onClose={() => setShowStatsPopup(false)}
          players={MOCK_FINISHED_GAME.players}
          game={MOCK_FINISHED_GAME}
        />
        {renderToasts()}
        </GameErrorBoundary>
      </div>
    )
  }

  // Request a full state refresh from the server with exponential backoff (prevents resync loops).
  // `reason` is for debugging/telemetry (optional).
  const handleResyncGame = (reason) => {
    try {
      const now = Date.now()
      const isManual = reason == null
      if (isManual) {
        autoResyncRef.current.attempts = 0
        autoResyncRef.current.lastRequestAt = 0
      }

      const attempts = autoResyncRef.current.attempts
      const lastAt = autoResyncRef.current.lastRequestAt

      // Backoff: ~0.6s, 1.2s, 2.4s, 4.8s, cap at 5s.
      const baseDelayMs = 600
      const maxDelayMs = 5000
      const delayMs = isManual ? 0 : Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempts))

      if (!isManual && now - lastAt < delayMs) return

      autoResyncRef.current.lastRequestAt = now
      if (!isManual) autoResyncRef.current.attempts = attempts + 1

      const requestId = nextRequestId()
      setClientCorrelation({ requestId })
      // E2: metric for resync attempts (desync detectors / protocol mismatch / manual)
      socket.emit('client-metric', {
        metricType: 'resync_requested',
        reason: reason ?? 'manual',
        requestId,
      })
      socket.emit('get-game-state', { reason: reason ?? 'manual', requestId })
    } catch (_) {
      // If emitting fails, the global crash handlers will still capture uncaught errors.
    }
  }

  if (inActiveGame) {
    const gameEnded = gameState?.state === 'finished';
    return (
      <div className="game-fade-in">
        {protocolMismatch && (
          <div
            style={{
              margin: '0 1rem 0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: 8,
              background: 'rgba(255, 193, 7, 0.15)',
              border: '1px solid rgba(255, 193, 7, 0.35)',
              color: '#fff',
              textAlign: 'center',
            }}
          >
            Protocol mismatch detected. Syncing latest game state…
          </div>
        )}
        {gameEnded && (
          <>
            <button
              type="button"
              className="end-game-test-back"
              onClick={handleLeaveParty}
            >
              ← Back to lobby
            </button>
            <button
              type="button"
              className="end-game-test-stats"
              onClick={() => setShowStatsPopup(true)}
            >
              View stats
            </button>
          </>
        )}
        <GameErrorBoundary
          onError={(payload) => reportClientError(payload)}
          onResync={handleResyncGame}
          resyncVersion={resyncVersion}
        >
          <GameBoard
            game={gameState}
            socket={socket}
            playerId={playerId || socket.id}
            isConnected={isConnected}
            rejoinPending={rejoinPending}
            onResyncGame={handleResyncGame}
            onBackToLobby={handleLeaveParty}
          />
        </GameErrorBoundary>
        {gameEnded && (
          <StatsPopup
            open={showStatsPopup}
            onClose={() => setShowStatsPopup(false)}
            players={gameState.players}
            game={gameState}
          />
        )}
        {renderToasts()}
      </div>
    );
  }

  const landingLastUpdatedLabel = getLastUpdatedDisplayDate()

  return (
    <div className="landing">
      {!gameState ? (
        <div className="landing-content">
          <header className="landing-header">
            <h1>{landingMode === 'join' || landingMode === 'start' ? 'Tichu' : 'Welcome to Tichu'}</h1>
            <p className="landing-subtitle">
              {isConnected ? 'Connected' : 'Connecting…'}
            </p>
          </header>

          {landingMode == null ? (
            <div className="landing-actions">
              <div className="landing-buttons">
                <button type="button" className="landing-btn" onClick={() => setLandingMode('start')}>
                  Start Party
                </button>
                <button type="button" className="landing-btn" onClick={() => setLandingMode('join')}>
                  Join Party
                </button>
              </div>
              <button type="button" className="landing-btn-small" onClick={handleTestGame}>
                Quick test game
              </button>
            </div>
          ) : landingMode === 'start' ? (
            <div className="landing-actions">
              <input
                type="text"
                className="landing-input"
                placeholder="Your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              <div className="landing-buttons">
                <button type="button" className="landing-btn" onClick={handleCreateGame}>
                  Create game
                </button>
              </div>
              <button type="button" className="landing-back" onClick={() => setLandingMode(null)}>
                ← Back
              </button>
            </div>
          ) : (
            <div className="landing-join-menu">
              <label className="landing-join-label">Join Party</label>
              <input
                type="text"
                className="landing-input landing-join-input"
                placeholder="Your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              <input
                type="text"
                className="landing-input landing-join-input"
                placeholder="Party code"
                value={gameId}
                onChange={(e) => setGameId(e.target.value.toUpperCase())}
              />
              <div className="landing-join-buttons">
                <button type="button" className="landing-join-back" onClick={() => setLandingMode(null)}>
                  Back
                </button>
                <button type="button" className="landing-join-submit" onClick={handleJoinGame}>
                  Join
                </button>
              </div>
            </div>
          )}

          {landingMode == null && (
            <footer className="landing-footer">
              <Link to="/how-to-play" className="landing-footer-link landing-footer-btn">
                How to play
              </Link>
              <a
                href="https://forms.gle/zGy4eHoQyhwnfSEt7"
                className="landing-footer-link landing-footer-btn"
                target="_blank"
                rel="noopener noreferrer"
              >
                Submit feedback
              </a>
              {LANDING_UPDATE_DAYS.length > 0 && landingLastUpdatedLabel && (
                <button
                  type="button"
                  className="landing-updates-trigger"
                  onClick={() => setShowLandingUpdates(true)}
                  aria-haspopup="dialog"
                >
                  Last updated {landingLastUpdatedLabel}
                </button>
              )}
              <p className="landing-credit">Created by Dylan Salmo</p>
            </footer>
          )}
        </div>
      ) : gameState && !inActiveGame ? (
        <div className="landing-content lobby" key={`lobby-${gameState.id}-v${gameStateVersion}-${(gameState.players || []).map(p => `${p.id ?? p.socketId}:${p.team ?? 1}`).join('|')}`}>
          <header className="lobby-header">
            <h1 className="lobby-title">Tichu</h1>
            <p className="lobby-code">{gameState.id}</p>
            <button
              type="button"
              className="lobby-invite-btn"
              onClick={() => {
                const url = `${window.location.origin}/?join=${gameState.id}`
                navigator.clipboard.writeText(url).then(() => {
                  setInviteCopied(true)
                  setTimeout(() => setInviteCopied(false), 2000)
                })
              }}
            >
              {inviteCopied ? 'Copied!' : 'Copy invite link'}
            </button>
          </header>

          <section className="lobby-card lobby-players-card">
            <h2 className="lobby-card-title">
              Players
              <span className="lobby-badge">{gameState.players.length}</span>
            </h2>
            <div className="lobby-players">
              {gameState.players.map((player, index) => {
                const isHost = gameState.players[0]?.id === player.id || gameState.players[0]?.socketId === player.socketId
                const isYou = isMe(player)
                const isEditingThis = isYou && editingMyName
                const rowKey = player.id ?? player.socketId ?? `player-${index}`
                const team = player.team === 2 ? 2 : 1
                return (
                  <div key={`${rowKey}-team${team}`} className={`lobby-player ${isHost ? 'lobby-player-host' : ''}`}>
                    {isEditingThis ? (
                      <div className="lobby-player-edit-row">
                        <input
                          type="text"
                          className="lobby-player-name-input"
                          value={lobbyNameDraft}
                          onChange={(e) => setLobbyNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveMyName()
                            if (e.key === 'Escape') cancelEditMyName()
                          }}
                          autoFocus
                        />
                        <button type="button" className="lobby-player-save" onClick={saveMyName}>
                          Save
                        </button>
                        <button type="button" className="lobby-player-cancel" onClick={cancelEditMyName}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="lobby-player-left">
                          <span className="lobby-player-name">{player.name}</span>
                          {player.disconnected && <span className="lobby-player-reconnecting">Reconnecting…</span>}
                          {isYou && (
                            <button
                              type="button"
                              className="lobby-player-edit"
                              onClick={startEditMyName}
                              title="Edit name"
                              aria-label="Edit name"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                          )}
                        </span>
                        <span className="lobby-player-right">
                          {isYou && isHost && <span className="lobby-player-role">You, Host</span>}
                          {isYou && !isHost && <span className="lobby-player-role">You</span>}
                          {isYou ? (
                            <span className="lobby-team-picker" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className={`lobby-team-btn ${team === 1 ? 'lobby-team-btn-active' : ''}`}
                                onClick={() => setMyTeam(1)}
                              >
                                Team 1
                              </button>
                              <button
                                type="button"
                                className={`lobby-team-btn ${team === 2 ? 'lobby-team-btn-active' : ''}`}
                                onClick={() => setMyTeam(2)}
                              >
                                Team 2
                              </button>
                            </span>
                          ) : (
                            <span className="lobby-player-team-badge">Team {team}</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {isMe(gameState.players[0]) && (
            <>
              <div className="lobby-custom-score">
                {!lobbyCustomScoreOpen ? (
                  <button
                    type="button"
                    className="lobby-custom-score-trigger"
                    onClick={() => setLobbyCustomScoreOpen(true)}
                  >
                    Custom score
                  </button>
                ) : (
                  <div className="lobby-custom-score-panel">
                    <div className="lobby-custom-score-panel-head">
                      <span className="lobby-custom-score-panel-title">Starting scores</span>
                      <button
                        type="button"
                        className="lobby-custom-score-close"
                        onClick={() => {
                          setLobbyCustomScoreOpen(false)
                          setLobbyStartingTeam1('')
                          setLobbyStartingTeam2('')
                        }}
                        aria-label="Close and use 0–0"
                      >
                        ×
                      </button>
                    </div>
                    <p className="lobby-custom-score-lead">Multiples of 5 · max 995 each</p>
                    <div className="lobby-starting-score-row">
                      <label className="lobby-starting-score-label">
                        <span className="lobby-starting-score-label-text">Team 1</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={995}
                          step={5}
                          className="lobby-starting-score-input"
                          value={lobbyStartingTeam1}
                          onChange={(e) => setLobbyStartingTeam1(e.target.value)}
                          onBlur={(e) => {
                            const t = e.target.value.trim()
                            if (t === '') return
                            const n = parseInt(t, 10)
                            if (!Number.isFinite(n)) return
                            let x = Math.max(0, Math.min(999, n))
                            x = Math.round(x / 5) * 5
                            if (x >= 1000) x = 995
                            setLobbyStartingTeam1(String(x))
                          }}
                          placeholder="0"
                          aria-label="Team 1 starting score"
                        />
                      </label>
                      <label className="lobby-starting-score-label">
                        <span className="lobby-starting-score-label-text">Team 2</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={995}
                          step={5}
                          className="lobby-starting-score-input"
                          value={lobbyStartingTeam2}
                          onChange={(e) => setLobbyStartingTeam2(e.target.value)}
                          onBlur={(e) => {
                            const t = e.target.value.trim()
                            if (t === '') return
                            const n = parseInt(t, 10)
                            if (!Number.isFinite(n)) return
                            let x = Math.max(0, Math.min(999, n))
                            x = Math.round(x / 5) * 5
                            if (x >= 1000) x = 995
                            setLobbyStartingTeam2(String(x))
                          }}
                          placeholder="0"
                          aria-label="Team 2 starting score"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="lobby-custom-score-dismiss"
                      onClick={() => {
                        setLobbyCustomScoreOpen(false)
                        setLobbyStartingTeam1('')
                        setLobbyStartingTeam2('')
                      }}
                    >
                      Use default (0–0)
                    </button>
                  </div>
                )}
              </div>
              <div className="lobby-start-wrap">
                {gameState.players.length === 4 && (
                  <button
                    type="button"
                    className="lobby-randomize"
                    onClick={handleRandomizeTeams}
                  >
                    Randomize teams
                  </button>
                )}
                <button
                  type="button"
                  className="lobby-start"
                  onClick={handleStartGame}
                  disabled={gameState.players.length !== 4}
                >
                  Start game
                </button>
                {gameState.players.length !== 4 && (
                  <p className="lobby-start-hint">Need 4 players to start</p>
                )}
              </div>
            </>
          )}

          <button type="button" className="lobby-leave" onClick={handleLeaveParty}>
            Leave party
          </button>
        </div>
      ) : null}
      {showLandingUpdates && !gameState && (
        <div
          className="landing-updates-overlay"
          onClick={() => setShowLandingUpdates(false)}
          role="presentation"
        >
          <div
            className="landing-updates-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-updates-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="landing-updates-header">
              <h2 id="landing-updates-title" className="landing-updates-title">
                Updates
              </h2>
              <button
                type="button"
                className="landing-updates-close"
                onClick={() => setShowLandingUpdates(false)}
                aria-label="Close updates"
              >
                ×
              </button>
            </div>
            <div className="landing-updates-body">
              {LANDING_UPDATE_DAYS.map((day) => (
                <section key={day.date} className="landing-updates-day">
                  <h3 className="landing-updates-day-title">{formatUpdateDayHeading(day.date)}</h3>
                  <ul className="landing-updates-list">
                    {(day.items || []).map((item, i) => {
                      const kindLabel = landingUpdateKindLabel(item.kind)
                      const kindClass =
                        item.kind &&
                        `landing-updates-kind--${String(item.kind).replace(/[^a-z0-9-]/gi, '').toLowerCase()}`
                      return (
                        <li key={`${day.date}-${i}`} className="landing-updates-item">
                          {kindLabel && (
                            <span className={kindClass ? `landing-updates-kind ${kindClass}` : 'landing-updates-kind'}>
                              {kindLabel}
                            </span>
                          )}
                          <span className="landing-updates-item-text">{item.text}</span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
      {renderToasts()}
    </div>
  )
}

export default App
