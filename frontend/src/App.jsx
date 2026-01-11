import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import GameBoard from './components/GameBoard'
import './App.css'

const socket = io('http://localhost:3001')

function App() {
  const [gameState, setGameState] = useState(null)
  const [playerName, setPlayerName] = useState('')
  const [gameId, setGameId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [playerId, setPlayerId] = useState(null)

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
        ) : (
          <GameBoard 
            game={gameState} 
            socket={socket} 
            playerId={playerId || socket.id}
          />
        )}
      </main>
    </div>
  )
}

export default App
