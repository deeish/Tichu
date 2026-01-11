const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const {
  initializeGame,
  declareGrandTichu,
  revealRemainingCards,
  declareTichu,
  exchangeCards,
  completeExchange,
  makeMove,
  getPlayerView
} = require('./game/gameState');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active games
const games = new Map();
const players = new Map();

// Game state structure:
// {
//   id: string,
//   players: [{ id, socketId, name, team }],
//   state: 'waiting' | 'dealing' | 'exchanging' | 'playing' | 'finished',
//   deck: [],
//   hands: { playerId: [] },
//   currentTrick: [],
//   leadPlayer: string,
//   scores: { team1: 0, team2: 0 },
//   turnOrder: []
// }

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('create-game', (playerName) => {
    const gameId = generateGameId();
    const game = {
      id: gameId,
      players: [{ id: socket.id, socketId: socket.id, name: playerName, team: 1 }],
      state: 'waiting',
      deck: [],
      hands: {},
      currentTrick: [],
      leadPlayer: null,
      scores: { team1: 0, team2: 0 },
      turnOrder: []
    };
    
    games.set(gameId, game);
    players.set(socket.id, { gameId, playerName });
    socket.join(gameId);
    
    socket.emit('game-created', { gameId, game });
    console.log(`Game ${gameId} created by ${playerName}`);
  });

  // Test mode: Create game with 4 players immediately
  socket.on('create-test-game', (playerName) => {
    const gameId = generateGameId();
    const testPlayerNames = [
      playerName || 'Player 1',
      'Test Player 2',
      'Test Player 3',
      'Test Player 4'
    ];
    
    const game = {
      id: gameId,
      players: [],
      state: 'waiting',
      deck: [],
      hands: {},
      currentTrick: [],
      leadPlayer: null,
      scores: { team1: 0, team2: 0 },
      turnOrder: []
    };
    
    // Randomly assign teams (partners sit opposite)
    // In Tichu, seating: 0-1-2-3 around table
    // Partners: 0 & 2 are partners, 1 & 3 are partners
    const teamAssignment = assignRandomTeams(4);
    
    // Create 4 test players (first one is the real socket, others are virtual)
    testPlayerNames.forEach((name, index) => {
      const playerId = index === 0 ? socket.id : `test-${gameId}-${index}`;
      const team = teamAssignment[index];
      game.players.push({
        id: playerId,
        socketId: index === 0 ? socket.id : null, // Only first player has real socket
        name: name,
        team: team,
        isTestPlayer: index > 0 // Mark test players
      });
      
      if (index === 0) {
        players.set(socket.id, { gameId, playerName: name });
      }
    });
    
    games.set(gameId, game);
    socket.join(gameId);
    
    // Immediately start the game
    startGame(gameId);
    
    console.log(`Test game ${gameId} created with 4 players (teams: ${teamAssignment.join(', ')})`);
  });

  socket.on('join-game', ({ gameId, playerName }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.players.length >= 4) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    // Assign team temporarily (will be randomized when 4 players join)
    const team = game.players.length < 2 ? 1 : 2;
    const player = {
      id: socket.id,
      socketId: socket.id,
      name: playerName,
      team: team
    };

    game.players.push(player);
    players.set(socket.id, { gameId, playerName });
    socket.join(gameId);

    io.to(gameId).emit('player-joined', { player, game });
    console.log(`${playerName} joined game ${gameId}`);

    // Start game when 4 players are ready
    if (game.players.length === 4) {
      // Randomly assign teams before starting
      assignRandomTeamsToGame(game);
      startGame(gameId);
    }
  });

  socket.on('disconnect', () => {
    const playerInfo = players.get(socket.id);
    if (playerInfo) {
      const game = games.get(playerInfo.gameId);
      if (game) {
        game.players = game.players.filter(p => p.id !== socket.id);
        io.to(playerInfo.gameId).emit('player-left', { playerId: socket.id, game });
      }
      players.delete(socket.id);
    }
    console.log('Player disconnected:', socket.id);
  });

  // Grand Tichu declaration
  socket.on('declare-grand-tichu', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const result = declareGrandTichu(game, socket.id);
    if (result.success) {
      // Check if all players have revealed cards (either declared Grand Tichu or revealed manually)
      const allRevealed = game.players.every(p => game.cardsRevealed[p.id]);
      
      if (allRevealed) {
        // Auto-advance to exchange phase
        setTimeout(() => {
          if (game.state === 'grand-tichu') {
            game.state = 'exchanging';
            broadcastGameUpdate(game);
            
            // Auto-exchange for test players
            const testPlayers = game.players.filter(p => p.isTestPlayer);
            testPlayers.forEach(testPlayer => {
              const testHand = game.hands[testPlayer.id] || [];
              if (testHand.length >= 3) {
                game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
                game.exchangeComplete[testPlayer.id] = true;
              }
            });
            broadcastGameUpdate(game);
          }
        }, 1000);
      }
      broadcastGameUpdate(game);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  // Reveal remaining cards
  socket.on('reveal-remaining-cards', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const result = revealRemainingCards(game, socket.id);
    if (result.success) {
      // Check if all players have revealed cards
      const allRevealed = game.players.every(p => game.cardsRevealed[p.id]);
      
      if (allRevealed) {
        // Auto-advance to exchange phase
        setTimeout(() => {
          if (game.state === 'grand-tichu') {
            game.state = 'exchanging';
            broadcastGameUpdate(game);
            
            // Auto-exchange for test players
            const testPlayers = game.players.filter(p => p.isTestPlayer);
            testPlayers.forEach(testPlayer => {
              const testHand = game.hands[testPlayer.id] || [];
              if (testHand.length >= 3) {
                game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
                game.exchangeComplete[testPlayer.id] = true;
              }
            });
            broadcastGameUpdate(game);
          }
        }, 1000);
      }
      broadcastGameUpdate(game);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  // Skip Grand Tichu (no longer needed - use reveal-remaining-cards instead)
  // Keeping for backwards compatibility but it now just reveals cards
  socket.on('skip-declaration', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    // Just reveal cards instead
    socket.emit('reveal-remaining-cards');
  });

  // Tichu declaration (can be called during playing phase when playing first card)
  socket.on('declare-tichu', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const result = declareTichu(game, socket.id);
    if (result.success) {
      broadcastGameUpdate(game);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  // Card exchange
  socket.on('exchange-cards', (cards) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const result = exchangeCards(game, socket.id, cards);
    if (result.success) {
      game.exchangeComplete[socket.id] = true;
      
      // For test games, auto-exchange for test players
      const testPlayers = game.players.filter(p => p.isTestPlayer);
      testPlayers.forEach(testPlayer => {
        if (!game.exchangeComplete[testPlayer.id]) {
          const testHand = game.hands[testPlayer.id] || [];
          // Auto-select first 3 cards for test players
          if (testHand.length >= 3) {
            game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
            game.exchangeComplete[testPlayer.id] = true;
          }
        }
      });
      
      // Check if all players have exchanged
      const allExchanged = game.players.every(p => game.exchangeComplete[p.id]);
      if (allExchanged) {
        const exchangeResult = completeExchange(game);
        if (!exchangeResult.success) {
          socket.emit('error', { message: exchangeResult.error });
          return;
        }
      }
      
      broadcastGameUpdate(game);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  // Make a move (play cards or pass)
  socket.on('make-move', ({ cards, action, mahJongWish }) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const result = makeMove(game, socket.id, cards || [], action || 'play', mahJongWish || null);
    if (result.success) {
      broadcastGameUpdate(game);
      
      if (result.playerWon) {
        io.to(playerInfo.gameId).emit('player-won-round', {
          playerId: socket.id,
          tichuBonus: result.tichuBonus
        });
      }
      
      if (result.trickWon) {
        io.to(playerInfo.gameId).emit('trick-won', {
          winner: result.winner
        });
      }
      
      // Auto-handle test players' turns
      setTimeout(() => {
        handleTestPlayerTurn(game);
      }, 500);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  // Auto-handle test player turns
  function handleTestPlayerTurn(game) {
    if (!game || game.state !== 'playing') return;
    
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isTestPlayer) return;
    
    // Test players automatically pass
    const result = makeMove(game, currentPlayer.id, [], 'pass');
    if (result.success) {
      broadcastGameUpdate(game);
      
      if (result.trickWon) {
        io.to(game.id).emit('trick-won', {
          winner: result.winner
        });
      }
      
      // Check if next player is also a test player
      setTimeout(() => {
        handleTestPlayerTurn(game);
      }, 500);
    }
  }

  // Request current game state
  socket.on('get-game-state', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const playerView = getPlayerView(game, socket.id);
    socket.emit('game-state', { game: playerView });
  });
});

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Randomly assigns teams to 4 players
 * In Tichu, partners sit opposite each other:
 * - Positions 0 & 2 are partners
 * - Positions 1 & 3 are partners
 * Returns array of team assignments [team1, team2, team1, team2] or [team2, team1, team2, team1]
 */
function assignRandomTeams(numPlayers) {
  // Randomly decide which pair gets team 1
  const firstPairTeam = Math.random() < 0.5 ? 1 : 2;
  const secondPairTeam = firstPairTeam === 1 ? 2 : 1;
  
  // Partners sit opposite: 0&2, 1&3
  return [
    firstPairTeam,   // Position 0
    secondPairTeam,  // Position 1
    firstPairTeam,   // Position 2 (partner of 0)
    secondPairTeam   // Position 3 (partner of 1)
  ];
}

/**
 * Assigns random teams to all players in a game
 */
function assignRandomTeamsToGame(game) {
  if (game.players.length !== 4) return;
  
  const teamAssignment = assignRandomTeams(4);
  game.players.forEach((player, index) => {
    player.team = teamAssignment[index];
  });
  
  console.log(`Teams assigned: ${game.players.map(p => `${p.name} (Team ${p.team})`).join(', ')}`);
}

function startGame(gameId) {
  const game = games.get(gameId);
  if (!game) return;

  // Initialize the game (deal cards, set up state)
  initializeGame(game);
  
  // Broadcast game started to all players
  broadcastGameUpdate(game);
  
  // Auto-handle test players in Grand Tichu phase
  if (game.state === 'grand-tichu') {
    // Test players automatically reveal cards (skip Grand Tichu)
    setTimeout(() => {
      const testPlayers = game.players.filter(p => p.isTestPlayer);
      testPlayers.forEach(testPlayer => {
        if (!game.cardsRevealed[testPlayer.id]) {
          revealRemainingCards(game, testPlayer.id);
        }
      });
      broadcastGameUpdate(game);
      
      // Auto-advance to exchange phase when all revealed
      setTimeout(() => {
        if (game.state === 'grand-tichu') {
          const allRevealed = game.players.every(p => game.cardsRevealed[p.id]);
          if (allRevealed) {
            game.state = 'exchanging';
            broadcastGameUpdate(game);
            
            // Auto-exchange for test players
            const testPlayers = game.players.filter(p => p.isTestPlayer);
            testPlayers.forEach(testPlayer => {
              const testHand = game.hands[testPlayer.id] || [];
              if (testHand.length >= 3) {
                game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
                game.exchangeComplete[testPlayer.id] = true;
              }
            });
            broadcastGameUpdate(game);
          }
        }
      }, 1000);
    }, 500);
  }
}

function broadcastGameUpdate(game) {
  // Send personalized view to each player (hides other players' hands)
  game.players.forEach(player => {
    const playerView = getPlayerView(game, player.id);
    io.to(player.socketId).emit('game-update', { game: playerView });
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
