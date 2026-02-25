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
    if (!playerName.trim() || !gameId.trim()) {
      alert('Please enter your name and game ID')
      return
    }
    socket.emit('join-game', { gameId, playerName })
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
    <div className="app">
      <header>
        <h1>🎴 Tichu</h1>
        <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      </header>

      <main>
        {!gameState ? (
          <div className="lobby">
            <div className="input-group">
              <input
                type="text"
                placeholder="Your Name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <div className="actions">
              <button onClick={handleCreateGame}>Create Game</button>
              <div className="join-section">
                <input
                  type="text"
                  placeholder="Game ID"
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value.toUpperCase())}
                />
                <button onClick={handleJoinGame}>Join Game</button>
              </div>
              <div className="test-section">
                <button onClick={handleCreateTestGame} className="btn-test">
                  🧪 Create Test Game (Auto 4 Players)
                </button>
                <p className="test-hint">Skip lobby - instantly start testing game logic</p>
                <button onClick={() => setShowEndGameTest(true)} className="btn-test btn-test-endgame">
                  🏁 Test End Game Screen
                </button>
                <p className="test-hint">Preview the finished-game screen to design changes</p>
              </div>
            </div>
          </div>
        ) : gameState.state === 'waiting' ? (
          <div className="game">
            <div className="game-info">
              <h2>Game: {gameState.id}</h2>
              <p>State: {gameState.state}</p>
              <p>Players: {gameState.players.length}/4</p>
            </div>

            <div className="players">
              {gameState.players.map((player, index) => (
                <div key={player.id} className="player">
                  <p>{player.name}</p>
                  <p>Team {player.team}</p>
                </div>
              ))}
            </div>

            <p>Waiting for players... ({gameState.players.length}/4)</p>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default App
