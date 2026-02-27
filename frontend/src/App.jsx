import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import GameBoard from './components/GameBoard'
import StatsPopup from './components/StatsPopup'
import './App.css'

const socket = io('http://localhost:3001')

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
  const setGameStateRef = useRef(setGameState)
  setGameStateRef.current = setGameState

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

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true)
      setPlayerId(socket.id)
      console.log('Connected to server')
    }
    if (socket.connected) onConnect()
    socket.on('connect', onConnect)

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('game-created', (data) => {
      console.log('[game-created] socket.id:', socket.id, '| players:', data?.game?.players?.map(p => ({ id: p.id, socketId: p.socketId, name: p.name, team: p.team })))
      setGameState(data.game)
      setGameId(data.gameId)
      setPlayerId(socket.id)
    })

    socket.on('player-joined', (data) => {
      console.log('[player-joined] socket.id:', socket.id, '| players:', data?.game?.players?.map(p => ({ id: p.id, socketId: p.socketId, name: p.name, team: p.team })))
      setGameState(data.game)
      setPlayerId(socket.id)
    })

    socket.on('game-started', (data) => {
      setGameState(data.game)
    })

    socket.on('game-update', (data) => {
      setGameState(data.game)
    })

    socket.on('game-state', (data) => {
      if (!data?.game || !Array.isArray(data.game?.players)) return
      const teams = data.game.players.map(p => `${p.name}:Team ${p.team ?? 1}`).join(', ')
      console.log('[game-state] I am socket', socket.id, '| received team update → applying. Players:', teams)
      const nextGame = JSON.parse(JSON.stringify(data.game))
      setGameStateRef.current(nextGame)
      setGameStateVersion(v => v + 1)
    })

    socket.on('player-won-round', (data) => {
      console.log('Player won round:', data)
      // Game state will be updated via game-update
    })

    socket.on('trick-won', (data) => {
      console.log('Trick won by:', data)
    })

    socket.on('player-left', (data) => {
      setGameState(data.game)
    })

    socket.on('error', (data) => {
      alert(data.message)
    })

    return () => {
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

  // Debug: log this client's lobby view whenever lobby state changes (compare across tabs to see who received updates)
  useEffect(() => {
    if (!gameState || gameState.state !== 'waiting' || !gameState.players?.length) return
    const view = gameState.players.map(p => `${p.name}=Team${p.team ?? 1}`).join(', ')
    console.log('[lobby view] I am', socket.id, '| my screen shows:', view)
  }, [gameState])

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name')
      return
    }
    socket.emit('create-game', playerName)
  }

  const handleJoinGame = () => {
    if (!gameId.trim()) {
      alert('Please enter the party code')
      return
    }
    const name = playerName.trim() || 'Player'
    socket.emit('join-game', { gameId, playerName: name })
  }

  const handleLeaveParty = () => {
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
    console.log('[setMyTeam] clicked team:', team, '| socket.id:', socket?.id, '| myId:', myId, '| sid:', sid)
    if (!sid) {
      console.log('[setMyTeam] early return: no sid')
      return
    }
    const playersSnapshot = gameState?.players ?? []
    const meMatch = playersSnapshot.find(isMe)
    console.log('[setMyTeam] players in state:', playersSnapshot.map(p => ({ id: p.id, socketId: p.socketId, name: p.name, team: p.team })), '| isMe match:', meMatch ? { id: meMatch.id, team: meMatch.team } : 'NONE')
    socket.emit('set-player-team', Number(team))
    setGameState((prev) => {
      if (!prev?.players) return prev
      const next = {
        ...prev,
        players: prev.players.map((p) => (isMe(p) ? { ...p, team: Number(team) } : p)),
      }
      console.log('[setMyTeam] optimistic update applied, new teams:', next.players.map(p => ({ id: p.id, team: p.team })))
      return next
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
      </div>
    )
  }

  if (inActiveGame) {
    return (
      <div className="game-fade-in">
        <GameBoard
          game={gameState}
          socket={socket}
          playerId={playerId || socket.id}
          isConnected={isConnected}
        />
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
                placeholder="abcd"
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
              <a href="https://en.wikipedia.org/wiki/Tichu" target="_blank" rel="noopener noreferrer" className="landing-footer-link">
                How to play
              </a>
              <button type="button" className="landing-footer-link landing-footer-btn" onClick={() => {}}>
                Submit feedback
              </button>
              <p className="landing-credit">Created by Dylan Salmo</p>
            </footer>
          )}
        </div>
      ) : gameState && !inActiveGame ? (
        <div className="landing-content lobby" key={`lobby-${gameState.id}-v${gameStateVersion}-${(gameState.players || []).map(p => `${p.id ?? p.socketId}:${p.team ?? 1}`).join('|')}`}>
          {(() => {
            const teamsSnapshot = (gameState.players || []).map(p => ({ name: p.name, team: p.team ?? 1 }))
            console.log('[LOBBY RENDER] socket', socket.id, '| UI is rendering with teams:', teamsSnapshot)
            return null
          })()}
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
