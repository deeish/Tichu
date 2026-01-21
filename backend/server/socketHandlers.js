/**
 * Socket event handlers
 * Handles all WebSocket communication with clients
 */

const {
  declareGrandTichu,
  revealRemainingCards,
  declareTichu,
  exchangeCards,
  completeExchange,
  makeMove,
  selectDragonOpponent,
  getPlayerView
} = require('../game/gameState');
const { assignRandomTeamsToGame, startGame, generateGameId } = require('./gameManager');

/**
 * Sets up all socket event handlers
 */
function setupSocketHandlers(io, games, players) {
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
      const { assignRandomTeams } = require('./gameManager');
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
      const broadcastFn = (game) => broadcastGameUpdate(io, game);
      startGame(gameId, games, broadcastFn);
      
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
        const broadcastFn = (game) => broadcastGameUpdate(io, game);
        startGame(gameId, games, broadcastFn);
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
              broadcastGameUpdate(io, game);
              
              // Auto-exchange for test players
              const testPlayers = game.players.filter(p => p.isTestPlayer);
              testPlayers.forEach(testPlayer => {
                const testHand = game.hands[testPlayer.id] || [];
                if (testHand.length >= 3) {
                  game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
                  game.exchangeComplete[testPlayer.id] = true;
                }
              });
              broadcastGameUpdate(io, game);
            }
          }, 1000);
        }
        broadcastGameUpdate(io, game);
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
              broadcastGameUpdate(io, game);
              
              // Auto-exchange for test players
              const testPlayers = game.players.filter(p => p.isTestPlayer);
              testPlayers.forEach(testPlayer => {
                const testHand = game.hands[testPlayer.id] || [];
                if (testHand.length >= 3) {
                  game.exchangeCards[testPlayer.id] = testHand.slice(0, 3);
                  game.exchangeComplete[testPlayer.id] = true;
                }
              });
              broadcastGameUpdate(io, game);
            }
          }, 1000);
        }
        broadcastGameUpdate(io, game);
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
        broadcastGameUpdate(io, game);
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
        
        broadcastGameUpdate(io, game);
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
        broadcastGameUpdate(io, game);
        
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
          handleTestPlayerTurn(game, games, io);
        }, 500);
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    // Select Dragon opponent (when Dragon wins a trick)
    socket.on('select-dragon-opponent', (selectedOpponentId) => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      
      const game = games.get(playerInfo.gameId);
      if (!game) return;
      
      const result = selectDragonOpponent(game, socket.id, selectedOpponentId);
      if (result.success) {
        broadcastGameUpdate(io, game);
        
        // Auto-handle test players' turns if needed
        setTimeout(() => {
          handleTestPlayerTurn(game, games, io);
        }, 500);
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    // Auto-handle test player turns
    function handleTestPlayerTurn(game, games, io) {
      if (!game || game.state !== 'playing') return;
      
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      if (!currentPlayer || !currentPlayer.isTestPlayer) return;
      
      // Test players automatically pass
      const result = makeMove(game, currentPlayer.id, [], 'pass');
      if (result.success) {
        broadcastGameUpdate(io, game);
        
        if (result.trickWon) {
          io.to(game.id).emit('trick-won', {
            winner: result.winner
          });
        }
        
        // Check if next player is also a test player
        setTimeout(() => {
          handleTestPlayerTurn(game, games, io);
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
}

function broadcastGameUpdate(io, game) {
  // Send personalized view to each player (hides other players' hands)
  game.players.forEach(player => {
    const playerView = getPlayerView(game, player.id);
    io.to(player.socketId).emit('game-update', { game: playerView });
  });
}

module.exports = {
  setupSocketHandlers,
  broadcastGameUpdate
};
