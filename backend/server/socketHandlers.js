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
const { sanitizeWireSnapshot } = require('../game/sanitizeWireSnapshot');
const { createActionDeduper } = require('./actionDeduper');
const { createFixedWindowRateLimiter } = require('./simpleRateLimiter');
const { createMetricsStore } = require('./metricsStore');
const { getBotMove, getDragonOpponentChoice, getBotExchange, shouldDeclareTichu } = require('../game/simpleBot');
const { assignRandomTeamsToGame, startGame, generateGameId } = require('./gameManager');
const { initializeGame } = require('../game/initialization');

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * Shallow copy for room-wide emits (player-joined / player-left). In-memory games still have every
 * player's rejoin token; broadcasting that lets clients that pick "me" via find(p => p.token) lock
 * onto the first player (host) instead of themselves.
 */
function gameSnapshotForRoomPeers(game) {
  if (!game || typeof game !== 'object') return game;
  // Never broadcast per-player exchange receipts map (privacy); use getPlayerView + game-update instead.
  const { exchangeReceiptByPlayer, ...rest } = game;
  return {
    ...rest,
    players: Array.isArray(game.players)
      ? game.players.map((p) => ({ ...p, token: undefined }))
      : [],
  };
}

/** Per-game throttle for broadcastGameUpdate: at most one broadcast per game per BROADCAST_THROTTLE_MS. */
const BROADCAST_THROTTLE_MS = 80;
const gameUpdateThrottle = new Map(); // gameId -> { timerId, pending }
const roundPreviewTimers = new Map(); // gameId -> timeout id
const actionDeduper = createActionDeduper({ ttlMs: 30_000 });
const gameStateVersionCounter = new Map(); // gameId -> monotonic counter
const metricsStore = createMetricsStore();

/** Optional Redis snapshot backend (see `gamePersistence.js`). */
let gameplayPersistence = null;

function setGameplayPersistence(backend) {
  gameplayPersistence = backend;
}

function syncStateVersionCountersFromGames(gamesMap) {
  if (!gamesMap) return;
  for (const [id, g] of gamesMap) {
    const v = g?.stateVersion;
    if (typeof v === 'number' && Number.isFinite(v)) {
      gameStateVersionCounter.set(id, v);
    } else {
      gameStateVersionCounter.set(id, 0);
    }
  }
}

function notifyGamePersist(game) {
  if (!game?.id) return;
  gameplayPersistence?.scheduleSave?.(game);
}

// G1: protect server from high-frequency event spam.
// Keys are (socketId + ':' + eventName).
const MAX_CARDS_PER_PLAY = 20;
const makeMoveRateLimiter = createFixedWindowRateLimiter({ windowMs: 1500, max: 8 });
const declarationRateLimiter = createFixedWindowRateLimiter({ windowMs: 1500, max: 4 });
const getGameStateRateLimiter = createFixedWindowRateLimiter({ windowMs: 5000, max: 3 });
const clientMetricRateLimiter = createFixedWindowRateLimiter({ windowMs: 2000, max: 40 });
const clientErrorSocketRateLimiter = createFixedWindowRateLimiter({ windowMs: 2000, max: 24 });
const chatMessageRateLimiter = createFixedWindowRateLimiter({ windowMs: 3000, max: 30 });

/** Resolve socket to stable player id (for game logic). Returns null if not in game or disconnected. */
function getPlayerIdInGame(game, socketId) {
  if (!game?.players) return null;
  const p = game.players.find((x) => x.socketId === socketId || x.id === socketId);
  return p && !p.disconnected ? p.id : null;
}

function emitStructuredSocketError(socket, eventName, err, context) {
  const message = 'Internal server error'
  const code = 'internal_error'

  // Server logs keep details; the client gets a stable, user-safe payload.
  try {
    console.error(
      '\n********** SERVER HANDLER ERROR **********\n' +
        `Socket: ${socket?.id ?? 'unknown'}\n` +
        `Event: ${eventName}\n` +
        (context ? `Context: ${JSON.stringify(context)}\n` : '') +
        `Error: ${err?.message ?? String(err)}\n` +
        (err?.stack ? err.stack : ''),
    )
  } catch (_) {}

  try {
    socket?.emit?.('error', { code, message })
  } catch (_) {}
}

/**
 * Wrap a socket handler so malformed payloads/unexpected logic errors can't crash the server.
 */
function safeSocketOn(socket, eventName, handler) {
  socket.on(eventName, (...args) => {
    try {
      return handler(...args)
    } catch (err) {
      const first = Array.isArray(args) ? args[0] : null
      const requestId = first && typeof first === 'object' ? first.requestId : undefined
      const actionId = first && typeof first === 'object' ? first.actionId : undefined
      emitStructuredSocketError(socket, eventName, err, {
        argTypes: Array.isArray(args) ? args.map((a) => typeof a) : [],
        requestId,
        actionId,
      })
    }
  })
}

function safeSetTimeout(socket, eventName, fn, ms, context) {
  return setTimeout(() => {
    try {
      fn()
    } catch (err) {
      const ctx = context && typeof context === 'object' ? context : {}
      emitStructuredSocketError(socket, eventName, err, ctx)
    }
  }, ms)
}

/**
 * Sets up all socket event handlers
 */
function setupSocketHandlers(io, games, players) {
  io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Restore session synchronously from handshake auth so players.set() is populated
    // before any event (auto-pass make-move, manual tap) can race with rejoin processing.
    const { gameId: _authGameId, token: _authToken } = socket.handshake.auth || {};
    if (_authGameId && _authToken) {
      const _authGame = games.get(_authGameId);
      const _authPlayer = _authGame?.players.find((p) => p.token === _authToken);
      if (_authGame && _authPlayer && (_authPlayer.disconnected || _authPlayer.socketId !== socket.id)) {
        _authPlayer.socketId = socket.id;
        _authPlayer.disconnected = false;
        delete _authPlayer.disconnectedAt;
        if (!_authPlayer.name) _authPlayer.name = 'Player';
        players.set(socket.id, { gameId: _authGameId, playerName: _authPlayer.name, playerId: _authPlayer.id });
        socket.join(_authGameId);
        console.log('[handshake-auth] session restored:', _authPlayer.name, socket.id, 'game', _authGameId);
      }
    }

    const safeOn = (eventName, handler) => safeSocketOn(socket, eventName, handler);

    function getCurrentStateVersion() {
      const playerInfo = players.get(socket.id);
      const game = playerInfo ? games.get(playerInfo.gameId) : null;
      return typeof game?.stateVersion === 'number' ? game.stateVersion : null;
    }

    /** P2c: never silently ignore gameplay events — client can show toast / resync. */
    function rejectNotInGame() {
      socket.emit('error', { code: 'not_in_game', message: 'Not in a game' });
    }
    function rejectGameMissing() {
      socket.emit('error', { code: 'game_not_found', message: 'Game not found' });
    }
    function rejectCannotAct() {
      socket.emit('error', {
        code: 'cannot_act',
        message: 'Cannot perform this action right now. Try Sync or rejoin if you were disconnected.',
        stateVersion: getCurrentStateVersion(),
      });
    }

    safeOn('create-game', (payloadOrPlayerName) => {
      const playerName =
        typeof payloadOrPlayerName === 'object' && payloadOrPlayerName != null
          ? payloadOrPlayerName.playerName
          : payloadOrPlayerName;
      const cleanedName = typeof playerName === 'string' ? playerName.trim() : '';
      if (!cleanedName) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid playerName' });
        return;
      }
      const protocolVersion = 1;
      const gameId = generateGameId();
      gameStateVersionCounter.set(gameId, 0);
      const playerId = generateId();
      const token = generateId();
      const game = {
        id: gameId,
        protocolVersion,
        players: [{ id: playerId, socketId: socket.id, name: cleanedName, team: 1, token }],
        state: 'waiting',
        stateVersion: 0,
        deck: [],
        hands: {},
        currentTrick: [],
        leadPlayer: null,
        scores: { team1: 0, team2: 0 },
        turnOrder: []
      };

      games.set(gameId, game);
      players.set(socket.id, { gameId, playerName, playerId });
      socket.join(gameId);
      notifyGamePersist(game);
      const roomAfter = io.sockets.adapter.rooms.get(gameId);
      const view = getPlayerView(game, socket.id);
      socket.emit('game-created', { gameId, game: view, playerToken: token });
      console.log(`Game ${gameId} created by ${cleanedName} (${socket.id}). Sockets in room: ${roomAfter ? roomAfter.size : 0}`);
    });

    // Test mode: Create game with 4 players immediately
    safeOn('create-test-game', (payloadOrPlayerName) => {
      const playerName =
        typeof payloadOrPlayerName === 'object' && payloadOrPlayerName != null
          ? payloadOrPlayerName.playerName
          : payloadOrPlayerName;
      const cleanedName = typeof playerName === 'string' ? playerName.trim() : '';
      if (!cleanedName) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid playerName' });
        return;
      }
      const protocolVersion = 1;
      const gameId = generateGameId();
      gameStateVersionCounter.set(gameId, 0);
      const botNamePool = ['Ada', 'Boris', 'Cleo', 'Dmitri', 'Esme', 'Felix', 'Greta', 'Hugo', 'Iris', 'Jonas', 'Kira', 'Leo'];
      const botNames = [...botNamePool].sort(() => Math.random() - 0.5).slice(0, 3);
      const testPlayerNames = [
        cleanedName || 'You',
        ...botNames
      ];
      
      const game = {
        id: gameId,
        protocolVersion,
        players: [],
        state: 'waiting',
        stateVersion: 0,
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
          players.set(socket.id, { gameId, playerName: name, playerId });
        }
      });
      
      games.set(gameId, game);
      socket.join(gameId);
      
      // Immediately start the game
      const broadcastFn = (game) => broadcastGameUpdate(io, game, games);
      startGame(gameId, games, broadcastFn);

      // Emit game-created so client calls saveRejoinCreds — without this, localStorage stays
      // empty and every reconnect silently skips handshake-auth + rejoin for test games.
      const humanPlayer = game.players[0];
      const view = getPlayerView(game, socket.id);
      capGameForWire(view);
      sanitizeWireSnapshot(view);
      socket.emit('game-created', { game: view, gameId, playerToken: humanPlayer.token });

      console.log(`Test game ${gameId} created with 4 players (teams: ${teamAssignment.join(', ')})`);
    });

    safeOn('join-game', (payload) => {
      const body = payload && typeof payload === 'object' ? payload : null;
      const gameId = body?.gameId;
      const playerName = body?.playerName;
      const requestId = body?.requestId;
      if (typeof gameId !== 'string' || !gameId.trim()) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid gameId', requestId });
        return;
      }
      if (typeof playerName !== 'string' || !playerName.trim()) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid playerName', requestId });
        return;
      }

      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { code: 'game_not_found', message: 'Game not found', requestId });
        return;
      }

      const name = playerName.trim();
      const disconnectedSlot = game.players.find((p) => p.disconnected);

      if (game.players.length >= 4 && !disconnectedSlot) {
        socket.emit('error', { code: 'game_full', message: 'Game is full', requestId });
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

        players.set(socket.id, { gameId, playerName: name, playerId: disconnectedSlot.id });
        socket.join(gameId);
        const roomAfter = io.sockets.adapter.rooms.get(gameId);
        console.log(`${name} (${socket.id}) rejoined game ${gameId} by filling disconnected slot. Sockets in room: ${roomAfter ? roomAfter.size : 0}.`);

        const view = getPlayerView(game, socket.id);
        socket.emit('player-joined', { player: disconnectedSlot, game: view, playerToken: token });
        socket.to(gameId).emit('player-joined', {
          player: { ...disconnectedSlot, token: undefined },
          game: gameSnapshotForRoomPeers(game),
        });
        broadcastGameUpdate(io, game, games);
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
      players.set(socket.id, { gameId, playerName: name, playerId });
      socket.join(gameId);
      const roomAfter = io.sockets.adapter.rooms.get(gameId);
      console.log(`${name} (${socket.id}) joined game ${gameId} (${game.players.length}/4). Sockets now in room: ${roomAfter ? roomAfter.size : 0}. Waiting for host to start.`);

      const view = getPlayerView(game, socket.id);
      socket.emit('player-joined', { player, game: view, playerToken: token });
      socket.to(gameId).emit('player-joined', {
        player: { ...player, token: undefined },
        game: gameSnapshotForRoomPeers(game),
      });
      notifyGamePersist(game);
    });

    safeOn('start-game', (payload) => {
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
      const broadcastFn = (g) => broadcastGameUpdate(io, g, games);
      const startingScores =
        payload && typeof payload === 'object' && payload.startingScores != null
          ? payload.startingScores
          : undefined;
      startGame(playerInfo.gameId, games, broadcastFn, { startingScores });
      // Explicitly send game-update to the host (their own view, not players[0] which may have changed after seating)
      const gameAfter = games.get(playerInfo.gameId);
      if (gameAfter) {
        const hostView = getPlayerView(gameAfter, socket.id);
        capGameForWire(hostView);
        sanitizeWireSnapshot(hostView);
        socket.emit('game-update', { game: hostView });
      }
    });

    safeOn('update-player-name', (payloadOrPlayerName) => {
      const playerName =
        typeof payloadOrPlayerName === 'object' && payloadOrPlayerName != null
          ? payloadOrPlayerName.name
          : payloadOrPlayerName;
      const cleaned = typeof playerName === 'string' ? playerName.trim() : '';
      if (!cleaned) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid player name' });
        return;
      }
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
      const name = cleaned;
      const player = game.players.find(p => p.socketId === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not in game' });
        return;
      }
      player.name = name;
      players.set(socket.id, { gameId: playerInfo.gameId, playerName: name, playerId: player.id });
      broadcastGameUpdate(io, game, games);
    });

    safeOn('set-player-team', (teamOrPayload) => {
      const playerInfo = players.get(socket.id);
      console.log('[set-player-team] received', { socketId: socket.id, playerInfo: playerInfo ? { gameId: playerInfo.gameId } : null, teamOrPayload });
      if (!playerInfo) {
        socket.emit('error', { code: 'not_in_game', message: 'Not in a game' });
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { code: 'game_not_found', message: 'Game not found' });
        return;
      }
      if (game.state !== 'waiting') {
        socket.emit('error', { code: 'wrong_phase', message: 'Can only change teams in the lobby' });
        return;
      }
      const team = typeof teamOrPayload === 'object' && teamOrPayload != null && 'team' in teamOrPayload
        ? teamOrPayload.team
        : teamOrPayload;
      const teamNum = Number(team);
      if (teamNum !== 1 && teamNum !== 2) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid team value', team: teamNum });
        return;
      }
      const t = teamNum;
      let player = game.players.find((p) => p.socketId === socket.id || p.id === socket.id);
      if (!player && playerInfo.playerId) {
        player = game.players.find((p) => p.id === playerInfo.playerId);
      }
      if (!player) {
        console.log('[set-player-team] player not found in game.players', { socketId: socket.id, playerIds: game.players.map((p) => ({ id: p.id, socketId: p.socketId })) });
        socket.emit('error', { code: 'not_in_game', message: 'Player not in game' });
        return;
      }
      player.team = t;
      console.log('[set-player-team] updated', player.name, 'to team', t);
      broadcastGameUpdate(io, game, games);
    });

    safeOn('randomize-teams', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { code: 'not_in_game', message: 'Not in a game' });
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { code: 'game_not_found', message: 'Game not found' });
        return;
      }
      if (game.state !== 'waiting') {
        socket.emit('error', { code: 'wrong_phase', message: 'Can only randomize teams in the lobby' });
        return;
      }
      const isHost = game.players[0]?.socketId === socket.id;
      if (!isHost) {
        socket.emit('error', { message: 'Only the host can randomize teams' });
        return;
      }
      if (game.players.length !== 4) {
        socket.emit('error', { message: 'Need 4 players to randomize teams' });
        return;
      }
      assignRandomTeamsToGame(game);
      // Must bump stateVersion (via broadcastGameUpdate); plain game-state was dropped by clients
      // that already applied a snapshot with the same stateVersion (stale suppression).
      broadcastGameUpdate(io, game, games);
    });

    safeOn('leave-game', () => {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }
      const game = games.get(playerInfo.gameId);
      const leaving = game?.players.find((p) => p.socketId === socket.id);
      if (game && leaving) {
        game.players = game.players.filter((p) => p.id !== leaving.id);
        if (game.hands) delete game.hands[leaving.id];
        socket.to(playerInfo.gameId).emit('player-left', {
          playerId: leaving.id,
          game: gameSnapshotForRoomPeers(game),
        });
        if (game.players.length === 0) {
          releaseGameResources(playerInfo.gameId);
          games.delete(playerInfo.gameId);
        } else {
          notifyGamePersist(game);
          broadcastGameUpdate(io, game, games);
        }
      }
      players.delete(socket.id);
      socket.leave(playerInfo.gameId);
    });

    safeOn('chat-message', (payloadOrText) => {
      if (!chatMessageRateLimiter.allow(`${socket.id}:chat-message`)) {
        socket.emit('error', { code: 'rate_limited', message: 'Rate limit exceeded (chat)' });
        return;
      }
      const text = typeof payloadOrText === 'object' && payloadOrText != null ? payloadOrText.text : payloadOrText;
      if (typeof text !== 'string') return;
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }
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

    safeOn('rejoin', (payload, ack) => {
      const body = payload && typeof payload === 'object' ? payload : null;
      const gameId = body?.gameId;
      const playerToken = body?.playerToken;
      const requestId = body?.requestId;
      if (typeof gameId !== 'string' || !gameId.trim()) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid rejoin gameId', requestId });
        if (typeof ack === 'function') ack({ error: 'bad_payload' });
        return;
      }
      if (typeof playerToken !== 'string' || !playerToken.trim()) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid rejoin token', requestId });
        if (typeof ack === 'function') ack({ error: 'bad_payload' });
        return;
      }
      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { code: 'game_not_found', message: 'Game not found', requestId });
        if (typeof ack === 'function') ack({ error: 'game_not_found' });
        return;
      }
      const player = game.players.find((p) => p.token === playerToken);
      if (!player) {
        socket.emit('error', { code: 'invalid_rejoin_token', message: 'Invalid rejoin token', requestId });
        if (typeof ack === 'function') ack({ error: 'invalid_rejoin_token' });
        return;
      }
      if (!player.disconnected && player.socketId === socket.id) {
        // Session already active on this socket (restored by handshake auth before this event).
        // Ack success and send fresh game-state so the client unblocks and has current data.
        if (typeof ack === 'function') ack({ success: true });
        broadcastGameUpdate(io, game, games);
        const existingView = getPlayerView(game, socket.id);
        capGameForWire(existingView);
        sanitizeWireSnapshot(existingView);
        socket.emit('game-state', { game: existingView });
        return;
      }
      player.socketId = socket.id;
      player.disconnected = false;
      delete player.disconnectedAt;
      // Preserve name (do not overwrite) so rejoining client and others still see it
      if (!player.name) player.name = players.get(socket.id)?.playerName || 'Player';
      players.set(socket.id, { gameId, playerName: player.name, playerId: player.id });
      socket.join(gameId);
      // Ack BEFORE broadcasting so client unblocks only after players.set() is guaranteed done.
      if (typeof ack === 'function') ack({ success: true });
      broadcastGameUpdate(io, game, games);
      const view = getPlayerView(game, socket.id);
      capGameForWire(view);
      sanitizeWireSnapshot(view);
      socket.emit('game-state', { game: view });
      console.log('Player rejoined:', player.name, socket.id, 'game', gameId);
    });

    safeOn('disconnect', () => {
      const playerInfo = players.get(socket.id);
      if (playerInfo) {
        const game = games.get(playerInfo.gameId);
        let p = game?.players.find((x) => x.socketId === socket.id);
        if (game && !p && playerInfo.playerId) {
          p = game.players.find((x) => x.id === playerInfo.playerId);
        }
        if (game && p) {
          if (p.socketId === socket.id) {
            p.disconnected = true;
            p.disconnectedAt = Date.now();
            p.socketId = null;
            broadcastGameUpdate(io, game, games);
          }
          // else: player already rejoined with a newer socket — don't disrupt their session
        } else if (game && playerInfo) {
          console.warn('[disconnect] no player row matched socket', {
            socketId: socket.id,
            playerId: playerInfo.playerId,
            gameId: playerInfo.gameId,
          });
        }
        players.delete(socket.id);
        if (game) socket.leave(game.id);
      }
      console.log('Player disconnected:', socket.id);
    });

    // Grand Tichu declaration
    safeOn('declare-grand-tichu', (payload) => {
      const actionId = payload?.actionId;
      const requestId = payload?.requestId;
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }
      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }
      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }
      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }
      if (!declarationRateLimiter.allow(`${socket.id}:declare-grand-tichu`)) {
        metricsStore.inc('rate_limited', 1, { event: 'declare-grand-tichu' });
        socket.emit('error', {
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          requestId,
          actionId,
        });
        return;
      }
      const result = declareGrandTichu(game, playerId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        // Check if all players have revealed cards (either declared Grand Tichu or revealed manually)
        const allRevealed = game.players.every(p => game.cardsRevealed[p.id]);
        
        if (allRevealed) {
          // Auto-advance to exchange phase
          safeSetTimeout(socket, 'declare-grand-tichu', () => {
            if (game.state === 'grand-tichu') {
              game.state = 'exchanging';
              broadcastGameUpdate(io, game, games);
              
              // Auto-exchange for test players
              const testPlayers = game.players.filter(p => p.isTestPlayer);
              testPlayers.forEach(testPlayer => {
                const testHand = game.hands[testPlayer.id] || [];
                if (testHand.length >= 3) {
                  game.exchangeCards[testPlayer.id] = getBotExchange(game, testPlayer.id);
                  game.exchangeComplete[testPlayer.id] = true;
                }
              });
              broadcastGameUpdate(io, game, games);
            }
          }, 1000, { gameId: game?.id });
        }
        broadcastGameUpdate(io, game, games);
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        metricsStore.inc('declaration_rejected', 1, { event: 'declare-grand-tichu' });
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    // Reveal remaining cards
    safeOn('reveal-remaining-cards', (payload) => {
      const { actionId } = payload && typeof payload === 'object' ? payload : {};
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      const result = revealRemainingCards(game, playerId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        const allRevealed = game.players.every((p) => game.cardsRevealed[p.id]);
        
        if (allRevealed) {
          // Auto-advance to exchange phase
          safeSetTimeout(socket, 'reveal-remaining-cards', () => {
            if (game.state === 'grand-tichu') {
              game.state = 'exchanging';
              broadcastGameUpdate(io, game, games);
              
              // Auto-exchange for test players
              const testPlayers = game.players.filter(p => p.isTestPlayer);
              testPlayers.forEach(testPlayer => {
                const testHand = game.hands[testPlayer.id] || [];
                if (testHand.length >= 3) {
                  game.exchangeCards[testPlayer.id] = getBotExchange(game, testPlayer.id);
                  game.exchangeComplete[testPlayer.id] = true;
                }
              });
              broadcastGameUpdate(io, game, games);
            }
          }, 1000, { gameId: game?.id });
        }
        broadcastGameUpdate(io, game, games);
      } else {
        metricsStore.inc('invalid_payload', 1, { event: 'reveal-remaining-cards', reason: 'reveal_rejected' });
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    // Skip Grand Tichu (no longer needed - use reveal-remaining-cards instead)
    // Keeping for backwards compatibility but it now just reveals cards
    safeOn('skip-declaration', (payload) => {
      const { actionId } = payload && typeof payload === 'object' ? payload : {};
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      const result = revealRemainingCards(game, playerId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        const allRevealed = game.players.every((p) => game.cardsRevealed[p.id]);
        if (allRevealed) {
          // Auto-advance to exchange phase
          safeSetTimeout(socket, 'reveal-remaining-cards', () => {
            if (game.state === 'grand-tichu') {
              game.state = 'exchanging';
              broadcastGameUpdate(io, game, games);
              
              // Auto-exchange for test players
              const testPlayers = game.players.filter(p => p.isTestPlayer);
              testPlayers.forEach(testPlayer => {
                const testHand = game.hands[testPlayer.id] || [];
                if (testHand.length >= 3) {
                  game.exchangeCards[testPlayer.id] = getBotExchange(game, testPlayer.id);
                  game.exchangeComplete[testPlayer.id] = true;
                }
              });
              broadcastGameUpdate(io, game, games);
            }
          }, 1000, { gameId: game?.id });
        }
        broadcastGameUpdate(io, game, games);
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    // Tichu declaration (can be called during playing phase when playing first card)
    safeOn('declare-tichu', (payload) => {
      const { actionId } = payload && typeof payload === 'object' ? payload : {};
      const requestId = payload && typeof payload === 'object' ? payload.requestId : undefined;
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      if (!declarationRateLimiter.allow(`${socket.id}:declare-tichu`)) {
        metricsStore.inc('rate_limited', 1, { event: 'declare-tichu' });
        socket.emit('error', {
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          requestId,
          actionId,
        });
        return;
      }

      const result = declareTichu(game, playerId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        broadcastGameUpdate(io, game, games);
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        metricsStore.inc('declaration_rejected', 1, { event: 'declare-tichu' });
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    safeOn('undeclare-tichu', (payload) => {
      const { actionId } = payload && typeof payload === 'object' ? payload : {};
      const requestId = payload && typeof payload === 'object' ? payload.requestId : undefined;
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      if (!declarationRateLimiter.allow(`${socket.id}:undeclare-tichu`)) {
        metricsStore.inc('rate_limited', 1, { event: 'undeclare-tichu' });
        socket.emit('error', {
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          requestId,
          actionId,
        });
        return;
      }

      const result = undeclareTichu(game, playerId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        broadcastGameUpdate(io, game, games);
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        metricsStore.inc('declaration_rejected', 1, { event: 'undeclare-tichu' });
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    safeOn('undeclare-grand-tichu', (payload) => {
      const { actionId } = payload && typeof payload === 'object' ? payload : {};
      const requestId = payload && typeof payload === 'object' ? payload.requestId : undefined;
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      if (!declarationRateLimiter.allow(`${socket.id}:undeclare-grand-tichu`)) {
        metricsStore.inc('rate_limited', 1, { event: 'undeclare-grand-tichu' });
        socket.emit('error', {
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          requestId,
          actionId,
        });
        return;
      }

      const result = undeclareGrandTichu(game, playerId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        broadcastGameUpdate(io, game, games);
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        metricsStore.inc('declaration_rejected', 1, { event: 'undeclare-grand-tichu' });
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    // Card exchange
    safeOn('exchange-cards', (payload) => {
      const isObj = payload && typeof payload === 'object' && !Array.isArray(payload);
      const actionId = isObj ? payload.actionId : null;
      const cards = isObj ? payload.cards : payload;
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      const result = exchangeCards(game, playerId, cards);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        game.exchangeComplete[playerId] = true;
        
        // Strategic auto-exchange for bot players
        const testPlayers = game.players.filter(p => p.isTestPlayer);
        testPlayers.forEach(testPlayer => {
          if (!game.exchangeComplete[testPlayer.id]) {
            const testHand = game.hands[testPlayer.id] || [];
            if (testHand.length >= 3) {
              game.exchangeCards[testPlayer.id] = getBotExchange(game, testPlayer.id);
              game.exchangeComplete[testPlayer.id] = true;
            }
          }
        });
        
        // Check if all players have exchanged
        const allExchanged = game.players.every(p => game.exchangeComplete[p.id]);
        if (allExchanged) {
          const exchangeResult = completeExchange(game);
        if (!exchangeResult.success) {
            socket.emit('error', { message: exchangeResult.error, stateVersion: getCurrentStateVersion() });
            return;
          }
          // Bots decide whether to declare Tichu in handleTestPlayerTurn (before their first play).
          // Start bot turns so bots play until it's the human's turn
          if (game.players.some(p => p.isTestPlayer)) {
            safeSetTimeout(socket, 'exchange-cards', () => handleTestPlayerTurn(game, games, io), 500, { gameId: game?.id });
          }
        }
        
        broadcastGameUpdate(io, game, games);
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    // Make a move (play cards or pass)
    safeOn('make-move', (payload) => {
      const { actionId, cards, action, mahJongWish } =
        payload && typeof payload === 'object' ? payload : {};
      const requestId = payload && typeof payload === 'object' ? payload.requestId : undefined;

      if (cards != null && !Array.isArray(cards)) {
        metricsStore.inc('invalid_payload', 1, { event: 'make-move', reason: 'cards_not_array' });
        socket.emit('error', { code: 'bad_payload', message: 'Invalid cards payload', requestId, actionId });
        return;
      }
      const cardsArr = Array.isArray(cards) ? cards : [];
      if (cardsArr.length > MAX_CARDS_PER_PLAY) {
        metricsStore.inc('invalid_payload', 1, { event: 'make-move', reason: 'cards_too_large' });
        socket.emit('error', {
          code: 'payload_too_large',
          message: `Too many cards in one move (max ${MAX_CARDS_PER_PLAY})`,
          requestId,
          actionId,
        });
        return;
      }
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }
      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      // Only rate-limit non-duplicate actions; duplicates should be answered via actionDeduper.
      if (!makeMoveRateLimiter.allow(`${socket.id}:make-move`)) {
        metricsStore.inc('rate_limited', 1, { event: 'make-move' });
        socket.emit('error', {
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          requestId,
          actionId,
        });
        return;
      }

      const moveAction = action || 'play';
      const result = makeMove(
        game,
        playerId,
        cardsArr,
        moveAction,
        mahJongWish || null
      );
      if (result.success) {
        if (process.env.DEBUG_TICHU_PASS === '1' && moveAction === 'pass') {
          try {
            console.log(
              '[pass]',
              JSON.stringify({
                gameId: game.id,
                playerId,
                stateVersion: game.stateVersion,
                passedLen: game.passedPlayers?.length,
                trickLen: game.currentTrick?.length,
                currentIdx: game.currentPlayerIndex,
                roundEnded: game.roundEnded,
                requestId,
              }),
            );
          } catch (_) {}
        }
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        broadcastGameUpdate(io, game, games);
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
        safeSetTimeout(socket, 'make-move', () => handleTestPlayerTurn(game, games, io), 500, { gameId: game?.id });
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        metricsStore.inc('move_rejected', 1, { event: 'make-move' });
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
      }
    });

    // Select Dragon opponent (when Dragon wins a trick)
    safeOn('select-dragon-opponent', (payload) => {
      const body = payload && typeof payload === 'object' ? payload : null;
      const actionId = body?.actionId;
      const selectedOpponentId = body?.selectedOpponentId ?? payload;
      if (typeof selectedOpponentId !== 'string' || !selectedOpponentId.trim()) {
        socket.emit('error', { code: 'bad_payload', message: 'Invalid selectedOpponentId' });
        return;
      }
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        rejectNotInGame();
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        rejectGameMissing();
        return;
      }

      const playerId = getPlayerIdInGame(game, socket.id);
      if (!playerId) {
        rejectCannotAct();
        return;
      }

      if (actionId) {
        const dup = actionDeduper.getResultIfDuplicate(game.id, playerId, actionId);
        if (dup) {
          if (dup.ok) {
            const view = getPlayerView(game, socket.id);
            capGameForWire(view);
            sanitizeWireSnapshot(view);
            socket.emit('game-state', { game: view });
            return;
          }
          socket.emit('error', {
            message: dup.errorMessage ?? 'Action already processed',
            stateVersion: getCurrentStateVersion(),
          });
          return;
        }
      }

      const result = selectDragonOpponent(game, playerId, selectedOpponentId);
      if (result.success) {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, { success: true });
        }
        broadcastGameUpdate(io, game, games);
        
        // Auto-handle test players' turns if needed
        safeSetTimeout(socket, 'select-dragon-opponent', () => handleTestPlayerTurn(game, games, io), 500, { gameId: game?.id });
      } else {
        if (actionId) {
          actionDeduper.storeResult(game.id, playerId, actionId, {
            success: false,
            errorMessage: result.error
          });
        }
        socket.emit('error', { message: result.error, stateVersion: getCurrentStateVersion() });
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
              broadcastGameUpdate(io, game, games);
              if (result.trickWon) {
                io.to(game.id).emit('trick-won', { winner: result.winner });
              }
              safeSetTimeout(socket, 'handleTestPlayerTurn', () => handleTestPlayerTurn(game, games, io), 500, { gameId: game?.id });
            }
          }
        }
        return;
      }

      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      if (!currentPlayer || !currentPlayer.isTestPlayer) return;

      // Bot Tichu declaration: only before its first card of the round, on a strong hand.
      if (!game.firstCardPlayed?.[currentPlayer.id]
        && !game.grandTichuDeclarations?.[currentPlayer.id]
        && !game.tichuDeclarations?.[currentPlayer.id]
        && shouldDeclareTichu(game.hands[currentPlayer.id] || [])) {
        const tichuResult = declareTichu(game, currentPlayer.id);
        if (tichuResult.success) broadcastGameUpdate(io, game, games);
      }

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
        broadcastGameUpdate(io, game, games);

        if (result.playerWon) {
          io.to(game.id).emit('player-won-round', {
            playerId: currentPlayer.id,
            tichuBonus: result.tichuBonus
          });
        }
        if (result.trickWon) {
          io.to(game.id).emit('trick-won', { winner: result.winner });
        }

        safeSetTimeout(socket, 'handleTestPlayerTurn', () => handleTestPlayerTurn(game, games, io), 500, { gameId: game?.id });
      }
    }

    // Request current game state
    safeOn('get-game-state', (payload) => {
      const requestId = payload && typeof payload === 'object' ? payload.requestId : undefined;
      if (!getGameStateRateLimiter.allow(`${socket.id}:get-game-state`)) {
        socket.emit('error', {
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          requestId,
        });
        return;
      }
      const playerInfo = players.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', {
          code: 'not_in_game',
          message: 'Not in a game',
          requestId,
        });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', {
          code: 'game_not_found',
          message: 'Game not found',
          requestId,
        });
        return;
      }

      const playerView = getPlayerView(game, socket.id);
      capGameForWire(playerView);
      sanitizeWireSnapshot(playerView);
      socket.emit('game-state', { game: playerView });
    });

    safeOn('client-error', (payload) => {
      if (!clientErrorSocketRateLimiter.allow(`${socket.id}:client-error`)) return;
      const src = payload?.source ? ` [${payload.source}]` : '';
      console.error('\n********** CLIENT ERROR **********');
      console.error('Socket:', socket.id);
      if (payload?.sentAt) console.error('Sent at:', payload.sentAt);
      if (payload?.requestId) console.error('requestId:', payload.requestId);
      if (payload?.actionId) console.error('actionId:', payload.actionId);
      console.error('[client-error]' + src, payload?.message ?? payload);
      if (payload?.stack) console.error(String(payload.stack).slice(0, 4000));
      if (payload?.componentStack) console.error(String(payload.componentStack).slice(0, 4000));
      if (payload?.location) console.error('Location:', payload.location);
      if (payload?.source === 'handValidation' && payload?.invalidCards?.length) {
        console.error('Invalid cards:', JSON.stringify(payload.invalidCards, null, 2));
        console.error('Filtered count:', payload.filteredCount, '| Hand length before:', payload.handLengthBefore, '| Game state:', payload.gameState);
      }
      console.error('**********************************\n');
    });

    // E2: metrics event from the frontend (resync, desync detectors, etc.)
    // Keep it fire-and-forget; metrics are in-memory and never block gameplay.
    safeOn('client-metric', (payload) => {
      if (!clientMetricRateLimiter.allow(`${socket.id}:client-metric`)) return;
      const metricType = payload?.metricType;
      if (typeof metricType !== 'string' || !metricType) return;
      const reasonRaw = payload?.reason;
      const reasonTag =
        typeof reasonRaw === 'string'
          ? reasonRaw.slice(0, 64)
          : reasonRaw != null
            ? String(reasonRaw).slice(0, 64)
            : undefined;
      metricsStore.inc(metricType, 1, reasonTag != null ? { reason: reasonTag } : undefined);
      try {
        if (payload?.requestId) {
          console.log(`[metric:${metricType}]`, { requestId: payload.requestId, reason: payload?.reason ?? undefined });
        } else {
          console.log(`[metric:${metricType}]`, { reason: payload?.reason ?? undefined });
        }
      } catch (_) {}
    });
  });
}

function releaseGameResources(gameId) {
  if (!gameId) return;
  gameStateVersionCounter.delete(gameId);
  const previewTimer = roundPreviewTimers.get(gameId);
  if (previewTimer) clearTimeout(previewTimer);
  roundPreviewTimers.delete(gameId);
  const te = gameUpdateThrottle.get(gameId);
  if (te?.timerId) {
    clearTimeout(te.timerId);
  }
  gameUpdateThrottle.delete(gameId);
  actionDeduper.removeGame(gameId);
  try {
    const p = gameplayPersistence?.deleteGame?.(gameId);
    if (p && typeof p.then === 'function') p.catch((e) => console.error('[persist] deleteGame', e));
  } catch (e) {
    console.error('[persist] deleteGame', e);
  }
}

function emitGameUpdateToAll(io, game) {
  if (!game?.players) return;
  game.players.forEach((player) => {
    if (player.socketId) {
      const playerView = getPlayerView(game, player.socketId);
      capGameForWire(playerView);
      sanitizeWireSnapshot(playerView);
      io.to(player.socketId).emit('game-update', { game: playerView });
    }
  });
}

function broadcastGameUpdate(io, game, gamesMap) {
  const gameId = game?.id;
  if (!gameId) {
    emitGameUpdateToAll(io, game);
    return;
  }

  // Monotonic server-side state version for ordering / stale snapshot suppression on clients.
  const nextVersion = (gameStateVersionCounter.get(gameId) ?? 0) + 1;
  gameStateVersionCounter.set(gameId, nextVersion);
  game.stateVersion = nextVersion;

  let entry = gameUpdateThrottle.get(gameId);
  if (!entry || entry.timerId == null) {
    emitGameUpdateToAll(io, game);
    entry = {
      pending: null,
      timerId: setTimeout(() => {
        try {
          if (gamesMap && !gamesMap.has(gameId)) return;
          const e = gameUpdateThrottle.get(gameId);
          const toEmit = e?.pending;
          if (e) {
            e.pending = null;
            e.timerId = null;
            if (gameUpdateThrottle.get(gameId) === e) gameUpdateThrottle.delete(gameId);
          }
          if (toEmit && gamesMap && toEmit.id && !gamesMap.has(toEmit.id)) return;
          if (toEmit) emitGameUpdateToAll(io, toEmit);
        } catch (err) {
          console.error('[broadcastGameUpdate] throttle emit failed', err?.message ?? String(err), err?.stack ?? '');
        }
      }, BROADCAST_THROTTLE_MS)
    };
    gameUpdateThrottle.set(gameId, entry);
  } else {
    entry.pending = game;
  }

  notifyGamePersist(game);

  // Server-driven round-end preview: keep final trick visible briefly before re-deal.
  if (
    game?.id &&
    game.state === 'round-ending-preview' &&
    game.roundPreviewPending === true &&
    !roundPreviewTimers.has(game.id)
  ) {
    const raw = Number(process.env.ROUND_END_PREVIEW_MS);
    const previewMs = Number.isFinite(raw) && raw >= 0 ? raw : 1200;
    const timerId = setTimeout(() => {
      try {
        roundPreviewTimers.delete(game.id);
        const live = gamesMap?.get(game.id);
        if (!live) return;
        if (live.state !== 'round-ending-preview' || live.roundPreviewPending !== true) return;
        live.roundPreviewPending = false;
        live.roundPreviewEndedAt = Date.now();
        initializeGame(live);
        broadcastGameUpdate(io, live, gamesMap);
      } catch (err) {
        console.error('[round-preview] finalize failed', err?.message ?? String(err), err?.stack ?? '');
      }
    }, previewMs);
    roundPreviewTimers.set(game.id, timerId);
  }
}

module.exports = {
  setupSocketHandlers,
  broadcastGameUpdate,
  setGameplayPersistence,
  syncStateVersionCountersFromGames,
  __test__: {
    safeSocketOn,
    emitStructuredSocketError,
    safeSetTimeout,
  },
};
