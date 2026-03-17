/**
 * Socket event handlers
 * Handles all WebSocket communication with clients
 */

const crypto = require('crypto');
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
const { capGameForWire } = require('../game/capGameForWire');
const { getBotMove, getDragonOpponentChoice } = require('../game/simpleBot');
const { assignRandomTeamsToGame, startGame, generateGameId } = require('./gameManager');

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/** Per-game throttle for broadcastGameUpdate: at most one broadcast per game per BROADCAST_THROTTLE_MS. */
const BROADCAST_THROTTLE_MS = 80;
const gameUpdateThrottle = new Map(); // gameId -> { timerId, pending }

/** Resolve socket to stable player id (for game logic). Returns null if not in game or disconnected. */
function getPlayerIdInGame(game, socketId) {
  if (!game?.players) return null;
  const p = game.players.find((x) => x.socketId === socketId || x.id === socketId);
  return p && !p.disconnected ? p.id : null;
}

/**
 * Sets up all socket event handlers
 */
function setupSocketHandlers(io, games, players) {
  io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('create-game', (playerName) => {
      const gameId = generateGameId();
      const playerId = generateId();
      const token = generateId();
      const game = {
        id: gameId,
        players: [{ id: playerId, socketId: socket.id, name: playerName, team: 1, token }],
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
      const view = getPlayerView(game, socket.id);
      socket.emit('game-created', { gameId, game: view, playerToken: token });
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
        const playerId = index === 0 ? generateId() : `test-${gameId}-${index}`;
        const team = teamAssignment[index];
        const token = index === 0 ? generateId() : null;
        game.players.push({
          id: playerId,
          socketId: index === 0 ? socket.id : null,
          name: name,
          team: team,
          token: token,
          isTestPlayer: index > 0
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

      const name = String(playerName || '').trim() || 'Player';
      const disconnectedSlot = game.players.find((p) => p.disconnected);

      if (game.players.length >= 4 && !disconnectedSlot) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      if (disconnectedSlot) {
        // Fill the disconnected slot so they can rejoin with the code (e.g. after accidentally leaving or losing token)
        const token = generateId();
        disconnectedSlot.socketId = socket.id;
        disconnectedSlot.token = token;
        disconnectedSlot.name = name;
        disconnectedSlot.disconnected = false;
        delete disconnectedSlot.disconnectedAt;

        players.set(socket.id, { gameId, playerName: name });
        socket.join(gameId);
        const roomAfter = io.sockets.adapter.rooms.get(gameId);
        console.log(`${name} (${socket.id}) rejoined game ${gameId} by filling disconnected slot. Sockets in room: ${roomAfter ? roomAfter.size : 0}.`);

        const view = getPlayerView(game, socket.id);
        socket.emit('player-joined', { player: disconnectedSlot, game: view, playerToken: token });
        socket.to(gameId).emit('player-joined', { player: { ...disconnectedSlot, token: undefined }, game });
        broadcastGameUpdate(io, game);
        return;
      }

      const playerId = generateId();
      const token = generateId();
      const player = {
        id: playerId,
        socketId: socket.id,
        name,
        team: 1,
        token
      };

      game.players.push(player);
      players.set(socket.id, { gameId, playerName: name });
      socket.join(gameId);
      const roomAfter = io.sockets.adapter.rooms.get(gameId);
      console.log(`${name} (${socket.id}) joined game ${gameId} (${game.players.length}/4). Sockets now in room: ${roomAfter ? roomAfter.size : 0}. Waiting for host to start.`);

      const view = getPlayerView(game, socket.id);
      socket.emit('player-joined', { player, game: view, playerToken: token });
      socket.to(gameId).emit('player-joined', { player: { ...player, token: undefined }, game });
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
      const isHost = game.players[0]?.socketId === socket.id;
      if (!isHost) {
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }
      if (game.players.length !== 4) {
        socket.emit('error', { message: 'Need 4 players to start' });
        return;
      }
      const disconnected = game.players.filter((p) => p.disconnected);
      if (disconnected.length > 0) {
        socket.emit('error', { message: 'All players must be connected to start. Waiting for: ' + disconnected.map((p) => p.name).join(', ') });
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
        capGameForWire(hostView);
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
      const player = game.players.find(p => p.socketId === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      player.name = name;
      players.set(socket.id, { gameId: playerInfo.gameId, playerName: name });
      game.players.forEach((p) => {
        if (p.socketId) {
          const view = getPlayerView(game, p.socketId);
          capGameForWire(view);
          io.to(p.socketId).emit('game-state', { game: view });
        }
      });
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
      const player = game.players.find(p => p.socketId === socket.id || p.id === socket.id);
      if (!player) {
        console.log('[set-player-team] early return: player not found in game.players', { socketId: socket.id, playerIds: game.players.map(p => ({ id: p.id, socketId: p.socketId })) });
        return;
      }
      player.team = t;
      console.log('[set-player-team] updated', player.name, 'to team', t);
      game.players.forEach((p) => {
        if (p.socketId) {
          const view = getPlayerView(game, p.socketId);
          capGameForWire(view);
          io.to(p.socketId).emit('game-state', { game: view });
        }
      });
    });

    socket.on('randomize-teams', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      const game = games.get(playerInfo.gameId);
      if (!game || game.state !== 'waiting') return;
      const isHost = game.players[0]?.socketId === socket.id;
      if (!isHost) return;
      if (game.players.length !== 4) return;
      assignRandomTeamsToGame(game);
      game.players.forEach((p) => {
        if (p.socketId) {
          const view = getPlayerView(game, p.socketId);
          capGameForWire(view);
          io.to(p.socketId).emit('game-state', { game: view });
        }
      });
    });

    socket.on('leave-game', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      const game = games.get(playerInfo.gameId);
      const leaving = game?.players.find((p) => p.socketId === socket.id);
      if (game && leaving) {
        game.players = game.players.filter((p) => p.id !== leaving.id);
        if (game.hands) delete game.hands[leaving.id];
        socket.to(playerInfo.gameId).emit('player-left', { playerId: leaving.id, game });
        if (game.players.length === 0) games.delete(playerInfo.gameId);
      }
      players.delete(socket.id);
      socket.leave(playerInfo.gameId);
    });

    socket.on('chat-message', (text) => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      const game = games.get(playerInfo.gameId);
      if (!game) return;
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return;
      const sender = game.players.find(p => p.socketId === socket.id || p.id === socket.id);
      const senderName = sender?.name ?? 'Someone';
      io.to(playerInfo.gameId).emit('chat-message', {
        senderId: sender?.id ?? socket.id,
        senderName,
        text: trimmed,
        id: `${socket.id}-${Date.now()}`
      });
    });

    socket.on('rejoin', ({ gameId, playerToken }) => {
      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      const player = game.players.find((p) => p.token === playerToken);
      if (!player) {
        socket.emit('error', { message: 'Invalid rejoin token' });
        return;
      }
      if (!player.disconnected) {
        socket.emit('error', { message: 'Already in game' });
        return;
      }
      player.socketId = socket.id;
      player.disconnected = false;
      delete player.disconnectedAt;
      // Preserve name (do not overwrite) so rejoining client and others still see it
      if (!player.name) player.name = players.get(socket.id)?.playerName || 'Player';
      players.set(socket.id, { gameId, playerName: player.name });
      socket.join(gameId);
      const view = getPlayerView(game, socket.id);
      capGameForWire(view);
      socket.emit('game-state', { game: view });
      broadcastGameUpdate(io, game);
      console.log('Player rejoined:', player.name, socket.id, 'game', gameId);
    });

    socket.on('disconnect', () => {
      const playerInfo = players.get(socket.id);
      if (playerInfo) {
        const game = games.get(playerInfo.gameId);
        const p = game?.players.find((x) => x.socketId === socket.id);
        if (game && p) {
          p.disconnected = true;
          p.disconnectedAt = Date.now();
          p.socketId = null;
          broadcastGameUpdate(io, game);
        }
        players.delete(socket.id);
        if (game) socket.leave(game.id);
      }
      console.log('Player disconnected:', socket.id);
    });

    // Grand Tichu declaration
    socket.on('declare-grand-tichu', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;
      const game = games.get(playerInfo.gameId);
      if (!game) return;
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = declareGrandTichu(game, playerId);
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = revealRemainingCards(game, playerId);
      if (result.success) {
        const allRevealed = game.players.every((p) => game.cardsRevealed[p.id]);
        
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = declareTichu(game, playerId);
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = undeclareTichu(game, playerId);
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = undeclareGrandTichu(game, playerId);
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = exchangeCards(game, playerId, cards);
      if (result.success) {
        game.exchangeComplete[playerId] = true;
        
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = makeMove(game, playerId, cards || [], action || 'play', mahJongWish || null);
      if (result.success) {
        broadcastGameUpdate(io, game);
        if (result.playerWon) {
          io.to(playerInfo.gameId).emit('player-won-round', {
            playerId,
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
      
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) return;
      const result = selectDragonOpponent(game, playerId, selectedOpponentId);
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
      capGameForWire(playerView);
      socket.emit('game-state', { game: playerView });
    });

    socket.on('client-error', (payload) => {
      const src = payload?.source ? ` [${payload.source}]` : '';
      console.error('\n********** CLIENT ERROR **********');
      console.error('Socket:', socket.id);
      if (payload?.sentAt) console.error('Sent at:', payload.sentAt);
      console.error('[client-error]' + src, payload?.message ?? payload);
      if (payload?.stack) console.error(payload.stack);
      if (payload?.componentStack) console.error('Component stack:', payload.componentStack);
      if (payload?.location) console.error('Location:', payload.location);
      if (payload?.source === 'handValidation' && payload?.invalidCards?.length) {
        console.error('Invalid cards:', JSON.stringify(payload.invalidCards, null, 2));
        console.error('Filtered count:', payload.filteredCount, '| Hand length before:', payload.handLengthBefore, '| Game state:', payload.gameState);
      }
      console.error('**********************************\n');
    });
  });
}

function emitGameUpdateToAll(io, game) {
  if (!game?.players) return;
  game.players.forEach((player) => {
    if (player.socketId) {
      const playerView = getPlayerView(game, player.socketId);
      capGameForWire(playerView);
      io.to(player.socketId).emit('game-update', { game: playerView });
    }
  });
}

function broadcastGameUpdate(io, game) {
  const gameId = game?.id;
  if (!gameId) {
    emitGameUpdateToAll(io, game);
    return;
  }
  let entry = gameUpdateThrottle.get(gameId);
  if (!entry || entry.timerId == null) {
    emitGameUpdateToAll(io, game);
    entry = {
      pending: null,
      timerId: setTimeout(() => {
        const e = gameUpdateThrottle.get(gameId);
        const toEmit = e?.pending;
        if (e) {
          e.pending = null;
          e.timerId = null;
          if (gameUpdateThrottle.get(gameId) === e) gameUpdateThrottle.delete(gameId);
        }
        if (toEmit) emitGameUpdateToAll(io, toEmit);
      }, BROADCAST_THROTTLE_MS)
    };
    gameUpdateThrottle.set(gameId, entry);
  } else {
    entry.pending = game;
  }
}

module.exports = {
  setupSocketHandlers,
  broadcastGameUpdate
};
