/**
 * Socket event handlers
 * Handles all WebSocket communication with clients
 */

const {
  declareGrandTichu,
  revealRemainingCards,
  declareTichu,
  undeclareTichu,
  undeclareGrandTichu,
  exchangeCards,
  completeExchange,
  makeMove,
  selectDragonOpponent,
  getPlayerView
} = require('../game/gameState');
const { getBotMove, getDragonOpponentChoice } = require('../game/simpleBot');
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
      const roomAfter = io.sockets.adapter.rooms.get(gameId);
      socket.emit('game-created', { gameId, game });
      console.log(`Game ${gameId} created by ${playerName} (${socket.id}). Sockets in room: ${roomAfter ? roomAfter.size : 0}`);
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

      // New joiners start on team 1; they can change to any team in the lobby
      const player = {
        id: socket.id,
        socketId: socket.id,
        name: playerName,
        team: 1
      };

      game.players.push(player);
      players.set(socket.id, { gameId, playerName });
      socket.join(gameId);
      const roomAfter = io.sockets.adapter.rooms.get(gameId);
      console.log(`${playerName} (${socket.id}) joined game ${gameId} (${game.players.length}/4). Sockets now in room: ${roomAfter ? roomAfter.size : 0}. Waiting for host to start.`);

      io.to(gameId).emit('player-joined', { player, game });
      // NO AUTO-START: Game only starts when host emits 'start-game'. Do not call startGame or broadcastGameUpdate here.
    });

    socket.on('start-game', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Not in a game' });
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game || game.state !== 'waiting') {
        socket.emit('error', { message: 'Game not found or already started' });
        return;
      }
      const isHost = game.players[0]?.id === socket.id;
      if (!isHost) {
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }
      if (game.players.length !== 4) {
        socket.emit('error', { message: 'Need 4 players to start' });
        return;
      }
      const team1Count = game.players.filter(p => p.team === 1).length;
      const team2Count = game.players.filter(p => p.team === 2).length;
      if (team1Count !== 2 || team2Count !== 2) {
        socket.emit('error', { message: 'Each team must have exactly 2 players. Currently: Team 1 has ' + team1Count + ', Team 2 has ' + team2Count + '.' });
        return;
      }
      // Use lobby team choices; do not overwrite with assignRandomTeamsToGame
      const broadcastFn = (g) => broadcastGameUpdate(io, g);
      startGame(playerInfo.gameId, games, broadcastFn);
      // Explicitly send game-update to the host (their own view, not players[0] which may have changed after seating)
      const gameAfter = games.get(playerInfo.gameId);
      if (gameAfter) {
        const hostView = getPlayerView(gameAfter, socket.id);
        socket.emit('game-update', { game: hostView });
      }
    });

    socket.on('update-player-name', (playerName) => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Not in a game' });
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game || game.state !== 'waiting') {
        socket.emit('error', { message: 'Game not found or already started' });
        return;
      }
      const name = String(playerName || '').trim() || 'Player';
      const player = game.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      player.name = name;
      players.set(socket.id, { gameId: playerInfo.gameId, playerName: name });
      const payload = { game: JSON.parse(JSON.stringify(game)) };
      io.in(playerInfo.gameId).emit('game-state', payload);
    });

    socket.on('set-player-team', (teamOrPayload) => {
      const playerInfo = players.get(socket.id);
      console.log('[set-player-team] received', { socketId: socket.id, playerInfo: playerInfo ? { gameId: playerInfo.gameId } : null, teamOrPayload });
      if (!playerInfo) {
        console.log('[set-player-team] early return: no playerInfo for socket.id');
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game || game.state !== 'waiting') {
        console.log('[set-player-team] early return: no game or state not waiting', { hasGame: !!game, state: game?.state });
        return;
      }
      const team = typeof teamOrPayload === 'object' && teamOrPayload != null && 'team' in teamOrPayload
        ? teamOrPayload.team
        : teamOrPayload;
      const t = Number(team) === 1 ? 1 : Number(team) === 2 ? 2 : 1;
      const player = game.players.find(p => p.id === socket.id || p.socketId === socket.id);
      if (!player) {
        console.log('[set-player-team] early return: player not found in game.players', { socketId: socket.id, playerIds: game.players.map(p => ({ id: p.id, socketId: p.socketId })) });
        return;
      }
      if (!player.id) player.id = socket.id;
      player.team = t;
      const payload = { game: JSON.parse(JSON.stringify(game)) };
      console.log('[set-player-team] updated', player.name, 'to team', t, '| teams:', payload.game.players.map(p => ({ name: p.name, team: p.team })));
      // Send to each player by socket id so every client gets the update (no reliance on room)
      const sent = new Set();
      game.players.forEach((p) => {
        const sid = p.socketId || p.id;
        if (sid && !sent.has(sid)) {
          sent.add(sid);
          io.to(sid).emit('game-state', payload);
        }
      });
      console.log('[set-player-team] sent game-state to', sent.size, 'sockets:', [...sent]);
    });

    socket.on('randomize-teams', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      const game = games.get(playerInfo.gameId);
      if (!game || game.state !== 'waiting') return;
      const isHost = game.players[0]?.id === socket.id;
      if (!isHost) return;
      if (game.players.length !== 4) return;
      assignRandomTeamsToGame(game);
      const payload = { game: JSON.parse(JSON.stringify(game)) };
      game.players.forEach((p) => {
        const sid = p.socketId || p.id;
        if (sid) io.to(sid).emit('game-state', payload);
      });
    });

    socket.on('leave-game', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      const game = games.get(playerInfo.gameId);
      if (game) {
        game.players = game.players.filter(p => p.id !== socket.id);
        socket.to(playerInfo.gameId).emit('player-left', { playerId: socket.id, game });
        if (game.players.length === 0) {
          games.delete(playerInfo.gameId);
        }
      }
      players.delete(socket.id);
      socket.leave(playerInfo.gameId);
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

    socket.on('undeclare-tichu', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      
      const game = games.get(playerInfo.gameId);
      if (!game) return;
      
      const result = undeclareTichu(game, socket.id);
      if (result.success) {
        broadcastGameUpdate(io, game);
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    socket.on('undeclare-grand-tichu', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      
      const game = games.get(playerInfo.gameId);
      if (!game) return;
      
      const result = undeclareGrandTichu(game, socket.id);
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
          // Test games: have one test player "call Tichu" (use a different one than Grand Tichu so both tags are visible)
          const testPlayers = game.players.filter(p => p.isTestPlayer);
          const tichuPlayer = testPlayers.length >= 2 ? testPlayers[1] : testPlayers[0];
          if (tichuPlayer && !game.grandTichuDeclarations?.[tichuPlayer.id]) {
            game.tichuDeclarations = game.tichuDeclarations || {};
            game.tichuDeclarations[tichuPlayer.id] = true;
          } else if (testPlayers.length > 0 && !game.grandTichuDeclarations?.[testPlayers[0].id]) {
            game.tichuDeclarations = game.tichuDeclarations || {};
            game.tichuDeclarations[testPlayers[0].id] = true;
          }
          // Start bot turns so test players play until it's the human's turn
          if (game.players.some(p => p.isTestPlayer)) {
            setTimeout(() => handleTestPlayerTurn(game, games, io), 500);
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

    // Auto-handle test player turns: play real moves via simpleBot, or select Dragon opponent
    function handleTestPlayerTurn(game, games, io) {
      if (!game || game.state !== 'playing') return;

      // If Dragon player must choose opponent and they're a test player, auto-select
      if (game.dragonOpponentSelection) {
        const dragonPlayerId = game.dragonOpponentSelection.playerId;
        const dragonPlayer = game.players.find(p => p.id === dragonPlayerId);
        if (dragonPlayer?.isTestPlayer) {
          const opponentId = getDragonOpponentChoice(game, dragonPlayerId);
          if (opponentId) {
            const result = selectDragonOpponent(game, dragonPlayerId, opponentId);
            if (result.success) {
              broadcastGameUpdate(io, game);
              if (result.trickWon) {
                io.to(game.id).emit('trick-won', { winner: result.winner });
              }
              setTimeout(() => handleTestPlayerTurn(game, games, io), 500);
            }
          }
        }
        return;
      }

      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      if (!currentPlayer || !currentPlayer.isTestPlayer) return;

      const move = getBotMove(game, currentPlayer.id);
      if (!move) return;

      const result = makeMove(
        game,
        currentPlayer.id,
        move.cards || [],
        move.action || 'play',
        move.mahJongWish || null
      );
      if (result.success) {
        broadcastGameUpdate(io, game);

        if (result.playerWon) {
          io.to(game.id).emit('player-won-round', {
            playerId: currentPlayer.id,
            tichuBonus: result.tichuBonus
          });
        }
        if (result.trickWon) {
          io.to(game.id).emit('trick-won', { winner: result.winner });
        }

        setTimeout(() => handleTestPlayerTurn(game, games, io), 500);
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
