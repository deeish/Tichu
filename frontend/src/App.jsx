import { useState, useEffect, useRef, startTransition } from 'react'
import { Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import GameBoard from './components/GameBoard'
import GameErrorBoundary from './components/GameErrorBoundary'
import StatsPopup from './components/StatsPopup'
import { initClientErrorReport, reportClientError } from './clientErrorReport'
import './App.css'

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001')
initClientErrorReport(socket)

const REJOIN_GAME_KEY = 'tichu_rejoin_gameId'
const REJOIN_TOKEN_KEY = 'tichu_rejoin_token'

/** Throttle game-update apply so we clone + setState at most this often (reduces re-renders and churn). */
const GAME_UPDATE_THROTTLE_MS = 90

/** Max trick plays and cards per play we pass to React (avoids DOM/layout explosion or hang from bad payload). */
const MAX_TRICK_PLAYS = 20;
const MAX_CARDS_PER_PLAY = 20;

/** Freeze mitigation: cap roundLog and playerStacks so clone/render never see unbounded arrays (see docs/FINALLY_KILLING_THE_FREEZE_BUG.md). */
const MAX_ROUND_LOG_ENTRIES = 80
const MAX_STACK_CARDS = 56

/**
 * Normalize critical game state so UI never sees undefined/invalid shapes (defensive, see docs/DEFENSIVE_GAME_STATE.md).
 * Also caps currentTrick, roundLog, and playerStacks so setState never receives huge arrays that could freeze render (see docs/FINALLY_KILLING_THE_FREEZE_BUG.md).
 */
function normalizeGameState(game) {
  if (!game || typeof game !== 'object') return game
  const next = { ...game }
  if (!Array.isArray(next.currentTrick)) next.currentTrick = []
  if (!Array.isArray(next.passedPlayers)) next.passedPlayers = []
  next.currentTrick = next.currentTrick
    .filter((p) => p && p.playerId != null && Array.isArray(p?.cards))
    .slice(0, MAX_TRICK_PLAYS)
    .map((p) => ({ ...p, cards: (p.cards || []).slice(0, MAX_CARDS_PER_PLAY) }))
  const turnLen = next.turnOrder?.length ?? 0
  if (turnLen > 0 && (typeof next.currentPlayerIndex !== 'number' || next.currentPlayerIndex < 0 || next.currentPlayerIndex >= turnLen)) {
    next.currentPlayerIndex = 0
  }
  if (Array.isArray(next.roundLog) && next.roundLog.length > MAX_ROUND_LOG_ENTRIES) {
    next.roundLog = next.roundLog.slice(-MAX_ROUND_LOG_ENTRIES)
  }
  if (next.playerStacks && typeof next.playerStacks === 'object') {
    const stacks = { ...next.playerStacks }
    for (const key of Object.keys(stacks)) {
      const stack = stacks[key]
      if (stack && Array.isArray(stack.cards) && stack.cards.length > MAX_STACK_CARDS) {
        stacks[key] = { ...stack, cards: stack.cards.slice(0, MAX_STACK_CARDS) }
      }
    }
    next.playerStacks = stacks
  }
  return next
}

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
  const setGameStateRef = useRef(setGameState)
  setGameStateRef.current = setGameState
  const pendingGameRef = useRef(null)
  const flushTimerRef = useRef(null)

  const [playerName, setPlayerName] = useState('')
  const [gameId, setGameId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [playerId, setPlayerId] = useState(null)
  const [showEndGameTest, setShowEndGameTest] = useState(false)
  const [showStatsPopup, setShowStatsPopup] = useState(false)
  // 'start' | 'join' | null — null = show only the two main buttons
  const [landingMode, setLandingMode] = useState(null)
  // Lobby: editing own name (show input + save)
  const [editingMyName, setEditingMyName] = useState(false)
  const [lobbyNameDraft, setLobbyNameDraft] = useState('')

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
    const onConnect = () => {
      setIsConnected(true)
      setPlayerId(socket.id)
      const savedGameId = localStorage.getItem(REJOIN_GAME_KEY)
      const savedToken = localStorage.getItem(REJOIN_TOKEN_KEY)
      if (savedGameId && savedToken) {
        socket.emit('rejoin', { gameId: savedGameId, playerToken: savedToken })
      }
      console.log('Connected to server')
    }
    if (socket.connected) onConnect()
    socket.on('connect', onConnect)

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('game-created', (data) => {
      startTransition(() => {
        const game = data?.game ? normalizeGameState(data.game) : data.game
        setGameState(game)
        setGameId(data.gameId)
        const me = data.game?.players?.find((p) => p.token)
        const myId = me?.id ?? socket.id
        setPlayerId(myId)
        if (data.playerToken) saveRejoinCreds(data.gameId, data.playerToken)
      })
    })

    socket.on('player-joined', (data) => {
      startTransition(() => {
        const game = data?.game ? normalizeGameState(data.game) : data.game
        setGameState(game)
        const gid = data.gameId ?? data.game?.id
        setGameId(gid)
        const me = data.game?.players?.find((p) => p.token)
        const myId = me?.id ?? socket.id
        setPlayerId(myId)
        if (data.playerToken && gid) saveRejoinCreds(gid, data.playerToken)
      })
    })

    socket.on('game-started', (data) => {
      startTransition(() => {
        const game = data?.game ? normalizeGameState(data.game) : data.game
        setGameState(game)
      })
    })

    socket.on('game-update', (data) => {
      const game = data?.game
      if (game && typeof game === 'object') {
        pendingGameRef.current = game
        const hasPlays = Array.isArray(game.currentTrick) && game.currentTrick.length > 0
        const me = game.players?.find((p) => p.token)
        const myId = me?.id
        const playerWentOut = myId && Array.isArray(game.hands?.[myId]) && game.hands[myId].length === 0
        if (hasPlays || playerWentOut) {
          if (flushTimerRef.current != null) {
            clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
          }
          pendingGameRef.current = null
          const gameToApply = game
          startTransition(() => {
            try {
              const cloned = normalizeGameState(JSON.parse(JSON.stringify(gameToApply)))
              setGameStateRef.current(cloned)
              const foundMe = cloned.players?.find((p) => p.token)
              if (foundMe?.id) setPlayerId(foundMe.id)
            } catch (_) {
              setGameStateRef.current(normalizeGameState(gameToApply))
            }
          })
          return
        }
        if (flushTimerRef.current == null) {
          flushTimerRef.current = setTimeout(() => {
            const pending = pendingGameRef.current
            pendingGameRef.current = null
            flushTimerRef.current = null
            if (pending && typeof pending === 'object') {
              startTransition(() => {
                try {
                  const cloned = normalizeGameState(JSON.parse(JSON.stringify(pending)))
                  setGameStateRef.current(cloned)
                  const me = cloned.players?.find((p) => p.token)
                  if (me?.id) setPlayerId(me.id)
                } catch (_) {
                  setGameStateRef.current(normalizeGameState(pending))
                }
              })
            }
          }, GAME_UPDATE_THROTTLE_MS)
        }
      } else {
        startTransition(() => {
          setGameStateRef.current(normalizeGameState(game))
        })
      }
    })

    // Apply in startTransition so Resync never blocks main thread (freeze fix; see docs/FINALLY_KILLING_THE_FREEZE_BUG.md).
    // Phase 6 (Option A): skip applying game-state when a game-update is pending so we never overwrite newer state with stale game-state (desync fix).
    socket.on('game-state', (data) => {
      if (!data?.game || !Array.isArray(data.game?.players)) return
      if (pendingGameRef.current != null) return
      const payload = data.game
      startTransition(() => {
        const nextGame = normalizeGameState(JSON.parse(JSON.stringify(payload)))
        const me = nextGame.players?.find((p) => p.token)
        if (me && nextGame.id) {
          saveRejoinCreds(nextGame.id, me.token)
          setPlayerId(me.id)
          setGameId(nextGame.id)
        }
        setGameStateRef.current(nextGame)
        setGameStateVersion(v => v + 1)
        setResyncVersion(v => v + 1)
      })
    })

    socket.on('player-won-round', () => {})
    socket.on('trick-won', () => {
      // Do NOT request get-game-state here: the winner often leads immediately; a delayed
      // game-state response (empty trick) would overwrite their lead play and show "No cards played yet".
      // Use the sidebar "Resync" button or error fallback "Sync game" if something looks wrong.
    })

    socket.on('player-left', (data) => {
      startTransition(() => {
        const game = data?.game ? normalizeGameState(data.game) : data.game
        setGameState(game)
      })
    })

    socket.on('error', (data) => {
      const msg = data?.message ?? ''
      if (msg.includes('rejoin') || msg === 'Game not found' || msg === 'Already in game' || msg === 'Invalid rejoin token') {
        clearRejoinCreds()
      }
      alert(data.message)
    })

    return () => {
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      pendingGameRef.current = null
      socket.off('connect', onConnect)
      socket.off('disconnect')
      socket.off('game-created')
      socket.off('player-joined')
      socket.off('game-started')
      socket.off('game-update')
      socket.off('game-state')
      socket.off('player-left')
      socket.off('player-won-round')
      socket.off('trick-won')
      socket.off('error')
    }
  }, [])

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name')
      return
    }
    try {
      localStorage.setItem('tichu-player-name', playerName.trim())
    } catch (_) {}
    socket.emit('create-game', playerName)
  }

  const handleJoinGame = () => {
    if (!gameId.trim()) {
      alert('Please enter the party code')
      return
    }
    const name = playerName.trim() || 'Player'
    try {
      localStorage.setItem('tichu-player-name', name)
    } catch (_) {}
    socket.emit('join-game', { gameId, playerName: name })
  }

  const handleLeaveParty = () => {
    clearRejoinCreds()
    socket.emit('leave-game')
    setGameState(null)
    setGameId('')
  }

  const handleStartGame = () => {
    socket.emit('start-game')
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
    socket.emit('set-player-team', Number(team))
    setGameState((prev) => {
      if (!prev?.players) return prev
      return {
        ...prev,
        players: prev.players.map((p) => (isMe(p) ? { ...p, team: Number(team) } : p)),
      }
    })
  }

  const handleRandomizeTeams = () => {
    socket.emit('randomize-teams')
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
    socket.emit('update-player-name', name)
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

  const handleCreateTestGame = () => {
    const name = playerName.trim() || 'Test Player'
    socket.emit('create-test-game', name)
  }

  // Only show game board when game has actually started (host clicked Start game).
  // Stay in lobby for 'waiting' or any unexpected state so joiners never see the game until host starts.
  const ACTIVE_GAME_STATES = ['grand-tichu', 'exchanging', 'playing', 'round-ended', 'finished']
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
        </GameErrorBoundary>
      </div>
    )
  }

  const handleResyncGame = () => {
    socket.emit('get-game-state')
  }

  if (inActiveGame) {
    return (
      <div className="game-fade-in">
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
            onResyncGame={handleResyncGame}
          />
        </GameErrorBoundary>
      </div>
    );
  }

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
            <div className="landing-secondary">
              <button type="button" className="landing-link" onClick={handleCreateTestGame}>
                Quick test game (4 players)
              </button>
              <button type="button" className="landing-link" onClick={() => setShowEndGameTest(true)}>
                Test end game screen
              </button>
            </div>
          )}

          {landingMode == null && (
            <footer className="landing-footer">
              <Link to="/how-to-play" className="landing-footer-link landing-footer-btn">
                How to play
              </Link>
              <button type="button" className="landing-footer-link landing-footer-btn" onClick={() => {}}>
                Submit feedback
              </button>
              <p className="landing-credit">Created by Dylan Salmo</p>
            </footer>
          )}
        </div>
      ) : gameState && !inActiveGame ? (
        <div className="landing-content lobby" key={`lobby-${gameState.id}-v${gameStateVersion}-${(gameState.players || []).map(p => `${p.id ?? p.socketId}:${p.team ?? 1}`).join('|')}`}>
          <header className="lobby-header">
            <h1 className="lobby-title">Tichu</h1>
            <p className="lobby-code">{gameState.id}</p>
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
          )}

          <button type="button" className="lobby-leave" onClick={handleLeaveParty}>
            Leave party
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default App
