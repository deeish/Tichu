import { useState, useEffect } from 'react'
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
  const [playerName, setPlayerName] = useState('')
  const [gameId, setGameId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [playerId, setPlayerId] = useState(null)
  const [showEndGameTest, setShowEndGameTest] = useState(false)
  const [showStatsPopup, setShowStatsPopup] = useState(false)
  // 'start' | 'join' | null — null = show only the two main buttons
  const [landingMode, setLandingMode] = useState(null)

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true)
      setPlayerId(socket.id)
      console.log('Connected to server')
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('game-created', (data) => {
      setGameState(data.game)
      setGameId(data.gameId)
      setPlayerId(socket.id)
    })

    socket.on('player-joined', (data) => {
      setGameState(data.game)
    })

    socket.on('game-started', (data) => {
      setGameState(data.game)
    })

    socket.on('game-update', (data) => {
      setGameState(data.game)
    })

    socket.on('game-state', (data) => {
      setGameState(data.game)
    })

    socket.on('player-won-round', (data) => {
      console.log('Player won round:', data)
      // Game state will be updated via game-update
    })

    socket.on('trick-won', (data) => {
      console.log('Trick won by:', data)
    })

    socket.on('error', (data) => {
      alert(data.message)
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('game-created')
      socket.off('player-joined')
      socket.off('game-started')
      socket.off('game-update')
      socket.off('game-state')
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

  const handleCreateTestGame = () => {
    const name = playerName.trim() || 'Test Player'
    socket.emit('create-test-game', name)
  }

  const inActiveGame = gameState && gameState.state !== 'waiting';

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
      <GameBoard
        game={gameState}
        socket={socket}
        playerId={playerId || socket.id}
        isConnected={isConnected}
      />
    );
  }

  return (
    <div className="landing">
      {!gameState ? (
        <div className="landing-content">
          <header className="landing-header">
            <h1>{landingMode === 'join' ? 'Tichu' : 'Welcome to Tichu'}</h1>
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

          {landingMode !== 'join' && (
            <div className="landing-secondary">
              <button type="button" className="landing-link" onClick={handleCreateTestGame}>
                Quick test game (4 players)
              </button>
              <button type="button" className="landing-link" onClick={() => setShowEndGameTest(true)}>
                Test end game screen
              </button>
            </div>
          )}

          <footer className="landing-footer">
            {landingMode !== 'join' && (
              <>
                <a href="https://en.wikipedia.org/wiki/Tichu" target="_blank" rel="noopener noreferrer" className="landing-footer-link">
                  How to play
                </a>
                <button type="button" className="landing-footer-link landing-footer-btn" onClick={() => {}}>
                  Submit feedback
                </button>
              </>
            )}
            <p className="landing-credit">Created by Dylan Salmo</p>
          </footer>
        </div>
      ) : gameState.state === 'waiting' ? (
        <div className="landing-content landing-waiting">
          <header className="landing-header">
            <h1>Game {gameState.id}</h1>
            <p className="landing-subtitle">Waiting for players ({gameState.players.length}/4)</p>
          </header>
          <div className="waiting-players">
            {gameState.players.map((player) => (
              <div key={player.id} className="waiting-player">
                <span className="waiting-player-name">{player.name}</span>
                <span className="waiting-player-team">Team {player.team}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
