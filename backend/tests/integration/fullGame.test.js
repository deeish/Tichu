/**
 * Full-game integration test
 * - Smoke: start → grand-tichu → exchange → one play.
 * - One round: grand-tichu → exchange → playing → round-ended.
 * - Full game: multiple rounds with 4 bots until a team reaches 1000 (can take 60–90s).
 * Run: npm test -- tests/integration/fullGame.test.js --testTimeout=90000
 */

const { startGame, assignRandomTeams } = require('../../server/gameManager');
const { makeMove } = require('../../game/moveHandler');
const { selectDragonOpponent } = require('../../game/trickManager');
const { revealRemainingCards } = require('../../game/declarations');
const { exchangeCards, completeExchange } = require('../../game/exchange');
const { getBotMove, getDragonOpponentChoice } = require('../../game/simpleBot');
const { handlePlayerWin } = require('../../game/scoring');
const { initializeGame } = require('../../game/initialization');
const { WINNING_SCORE } = require('../../config/gameRules');

const MAX_MOVES = 8000;
const MAX_ROUNDS = 30;

function createFullGameTestState() {
  const gameId = 'full-game-test-' + (Math.random().toString(36).slice(2, 8));
  const teamAssignment = assignRandomTeams(4);
  const game = {
    id: gameId,
    state: 'waiting',
    players: [
      { id: 'p1', name: 'Bot 1', team: teamAssignment[0], isTestPlayer: true },
      { id: 'p2', name: 'Bot 2', team: teamAssignment[1], isTestPlayer: true },
      { id: 'p3', name: 'Bot 3', team: teamAssignment[2], isTestPlayer: true },
      { id: 'p4', name: 'Bot 4', team: teamAssignment[3], isTestPlayer: true },
    ],
    deck: [],
    hands: {},
    currentTrick: [],
    leadPlayer: null,
    scores: { team1: 0, team2: 0 },
    turnOrder: [],
  };
  return { game, gameId };
}

function runGrandTichuAndExchange(game) {
  game.players.forEach((p) => {
    const result = revealRemainingCards(game, p.id);
    if (!result.success) throw new Error(`revealRemainingCards failed: ${result.error}`);
  });
  game.state = 'exchanging';

  game.players.forEach((p) => {
    const hand = game.hands[p.id] || [];
    if (hand.length < 3) throw new Error(`Player ${p.id} has fewer than 3 cards for exchange`);
    const three = hand.slice(0, 3);
    const result = exchangeCards(game, p.id, three);
    if (!result.success) throw new Error(`exchangeCards failed: ${result.error}`);
  });

  const complete = completeExchange(game);
  if (!complete.success) throw new Error(`completeExchange failed: ${complete.error}`);
  if (game.state !== 'playing') throw new Error(`Expected state 'playing' after exchange, got ${game.state}`);
}

function runPlayingPhase(game, stats) {
  let movesThisRound = 0;
  const maxMovesPerRound = 500;

  while (game.state === 'playing' && movesThisRound < maxMovesPerRound) {
    if (game.dragonOpponentSelection) {
      const { playerId } = game.dragonOpponentSelection;
      const opponentId = getDragonOpponentChoice(game, playerId);
      if (!opponentId) throw new Error('Dragon opponent choice returned null');
      const result = selectDragonOpponent(game, playerId, opponentId);
      if (!result.success) throw new Error(`selectDragonOpponent failed: ${result.error}`);
      movesThisRound++;
      continue;
    }

    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    if (!currentPlayer) throw new Error('No current player');
    if (game.playersOut?.includes(currentPlayer.id)) {
      handlePlayerWin(game, currentPlayer.id);
      continue;
    }

    const hand = game.hands[currentPlayer.id] || [];
    let move = getBotMove(game, currentPlayer.id) || { action: 'pass' };
    // Server: leadPlayer may never pass while they still have cards (empty or in-progress trick).
    if (move.action === 'pass' && game.leadPlayer === currentPlayer.id && hand.length > 0) {
      const card = hand.find((c) => c.name === 'mahjong') || hand[0];
      move = { cards: [card], action: 'play', mahJongWish: card.name === 'mahjong' ? '2' : null };
    }
    let result = makeMove(
      game,
      currentPlayer.id,
      move.cards || [],
      move.action || 'play',
      move.mahJongWish ?? null
    );

    if (!result.success && result.error) {
      if (
        hand.length > 0 &&
        result.error.includes('lead player') &&
        result.error.includes('cannot pass')
      ) {
        for (const card of hand) {
          move = { cards: [card], action: 'play', mahJongWish: card.name === 'mahjong' ? '2' : null };
          result = makeMove(game, currentPlayer.id, move.cards, move.action, move.mahJongWish);
          if (result.success) break;
        }
      }
      if (!result.success && result.error.includes('Mah Jong first') && hand.length > 0) {
        const mahjong = hand.find((c) => c.name === 'mahjong');
        if (mahjong) {
          move = { cards: [mahjong], action: 'play', mahJongWish: '2' };
          result = makeMove(game, currentPlayer.id, move.cards, move.action, move.mahJongWish);
        }
      }
      if (!result.success && result.error.includes('wished card') && game.mahJongWish?.wishedRank && hand.length > 0) {
        const wished = hand.find((c) => c.type === 'standard' && c.rank === game.mahJongWish.wishedRank);
        if (wished) {
          move = { cards: [wished], action: 'play', mahJongWish: null };
          result = makeMove(game, currentPlayer.id, move.cards, move.action, move.mahJongWish);
        }
      }
      if (!result.success && result.error.includes('cannot pass') && hand.length > 0 && game.currentTrick.length === 0) {
        const wishRank = game.mahJongWish?.wishedRank;
        let toTry = hand;
        if (wishRank) {
          const wished = hand.filter((c) => c.type === 'standard' && c.rank === wishRank);
          const rest = hand.filter((c) => !(c.type === 'standard' && c.rank === wishRank));
          toTry = [...wished, ...rest];
        }
        for (const card of toTry) {
          move = { cards: [card], action: 'play', mahJongWish: card.name === 'mahjong' ? '2' : null };
          result = makeMove(game, currentPlayer.id, move.cards, move.action, move.mahJongWish);
          if (result.success) break;
        }
      }
    }

    if (!result.success && (result.error.includes('higher combination') || result.error.includes('or pass'))) {
      move = { action: 'pass' };
      result = makeMove(game, currentPlayer.id, [], 'pass', null);
    }

    if (!result.success) {
      throw new Error(`makeMove failed: ${result.error} (player ${currentPlayer.id}, move: ${JSON.stringify(move)})`);
    }

    stats.totalMoves++;
    movesThisRound++;
  }

  if (game.state === 'playing' && movesThisRound >= maxMovesPerRound) {
    throw new Error(`Playing phase did not end within ${maxMovesPerRound} moves this round (possible infinite loop)`);
  }
}

describe('Full game (bot play to completion)', () => {
  test('runs from start to finished with 4 bots', () => {
    const { game, gameId } = createFullGameTestState();
    const games = new Map();
    games.set(gameId, game);

    startGame(gameId, games, () => {});

    const g = games.get(gameId);
    expect(g).toBeDefined();
    expect(g.state).toBe('grand-tichu');
    expect(g.players).toHaveLength(4);
    expect(g.turnOrder).toHaveLength(4);

    const stats = { totalMoves: 0, rounds: 0 };

    while (g.state !== 'finished' && stats.totalMoves < MAX_MOVES && stats.rounds < MAX_ROUNDS) {
      if (g.state === 'grand-tichu') {
        runGrandTichuAndExchange(g);
        stats.rounds++;
        continue;
      }

      if (g.state === 'playing') {
        runPlayingPhase(g, stats);
        continue;
      }

      if (g.state === 'round-ended') {
        throw new Error('Game stuck in round-ended (scoring should transition to grand-tichu or finished)');
      }
      if (g.state === 'round-ending-preview') {
        initializeGame(g);
        continue;
      }

      throw new Error(`Unexpected state: ${g.state}`);
    }

    expect(g.state).toBe('finished');
    expect([1, 2]).toContain(g.winner);
    expect(g.scores).toBeDefined();
    expect(typeof g.scores.team1).toBe('number');
    expect(typeof g.scores.team2).toBe('number');
    const winningTeam = g.winner === 1 ? g.scores.team1 : g.scores.team2;
    const losingTeam = g.winner === 1 ? g.scores.team2 : g.scores.team1;
    expect(winningTeam).toBeGreaterThanOrEqual(WINNING_SCORE);
    expect(losingTeam).toBeLessThan(WINNING_SCORE);
    expect(stats.totalMoves).toBeGreaterThan(0);
    expect(stats.rounds).toBeGreaterThan(0);
  }, 60000);

  test('runs three rounds without makeMove errors (bots and round transitions)', () => {
    const { game, gameId } = createFullGameTestState();
    const games = new Map();
    games.set(gameId, game);
    startGame(gameId, games, () => {});

    const g = games.get(gameId);
    const stats = { totalMoves: 0, rounds: 0 };
    const maxRounds = 3;

    while (g.state !== 'finished' && stats.rounds < maxRounds) {
      if (g.state === 'grand-tichu') {
        runGrandTichuAndExchange(g);
        stats.rounds++;
        continue;
      }
      if (g.state === 'playing') {
        runPlayingPhase(g, stats);
        continue;
      }
      if (g.state === 'round-ended') {
        throw new Error('Game stuck in round-ended');
      }
      if (g.state === 'round-ending-preview') {
        initializeGame(g);
        continue;
      }
      throw new Error(`Unexpected state: ${g.state}`);
    }

    expect(stats.rounds).toBeGreaterThanOrEqual(2);
    expect(stats.totalMoves).toBeGreaterThan(0);
  }, 60000);

  test('completes one full round (grand-tichu → exchange → playing → round-ended)', () => {
    const { game, gameId } = createFullGameTestState();
    const games = new Map();
    games.set(gameId, game);

    startGame(gameId, games, () => {});

    const g = games.get(gameId);
    expect(g.state).toBe('grand-tichu');

    runGrandTichuAndExchange(g);
    expect(g.state).toBe('playing');

    const stats = { totalMoves: 0 };
    const maxMovesOneRound = 600;
    while (g.state === 'playing' && stats.totalMoves < maxMovesOneRound) {
      if (g.dragonOpponentSelection) {
        const { playerId } = g.dragonOpponentSelection;
        const opponentId = getDragonOpponentChoice(g, playerId);
        const result = selectDragonOpponent(g, playerId, opponentId);
        if (!result.success) throw new Error(`selectDragonOpponent failed: ${result.error}`);
        stats.totalMoves++;
        continue;
      }

      const currentPlayer = g.turnOrder[g.currentPlayerIndex];
      if (!currentPlayer) throw new Error('No current player');
      if (g.playersOut?.includes(currentPlayer.id)) {
        handlePlayerWin(g, currentPlayer.id);
        continue;
      }

      let move = getBotMove(g, currentPlayer.id) || { action: 'pass' };
      let result = makeMove(g, currentPlayer.id, move.cards || [], move.action || 'play', move.mahJongWish ?? null);

      if (!result.success && result.error) {
        const hand = g.hands[currentPlayer.id] || [];
        if (result.error.includes('Mah Jong first') && hand.some((c) => c.name === 'mahjong')) {
          const mahjong = hand.find((c) => c.name === 'mahjong');
          move = { cards: [mahjong], action: 'play', mahJongWish: '2' };
          result = makeMove(g, currentPlayer.id, move.cards, move.action, move.mahJongWish);
        }
        if (!result.success && result.error.includes('wished card') && g.mahJongWish?.wishedRank && hand.length > 0) {
          const wished = hand.find((c) => c.type === 'standard' && c.rank === g.mahJongWish.wishedRank);
          if (wished) {
            move = { cards: [wished], action: 'play', mahJongWish: null };
            result = makeMove(g, currentPlayer.id, move.cards, move.action, move.mahJongWish);
          }
        }
        if (!result.success && result.error.includes('cannot pass') && hand.length > 0 && g.currentTrick.length === 0) {
          const wishRank = g.mahJongWish?.wishedRank;
          const toTry = wishRank ? [...hand].filter((c) => c.type === 'standard' && c.rank === wishRank).concat(hand.filter((c) => !(c.type === 'standard' && c.rank === wishRank))) : hand;
          for (const card of toTry) {
            move = { cards: [card], action: 'play', mahJongWish: card.name === 'mahjong' ? '2' : null };
            result = makeMove(g, currentPlayer.id, move.cards, move.action, move.mahJongWish);
            if (result.success) break;
          }
        }
        if (!result.success && (result.error.includes('higher combination') || result.error.includes('or pass'))) {
          move = { action: 'pass' };
          result = makeMove(g, currentPlayer.id, [], 'pass', null);
        }
      }

      if (!result.success) throw new Error(`makeMove failed: ${result.error} (player ${currentPlayer.id})`);
      stats.totalMoves++;
    }

    expect(['round-ended', 'round-ending-preview', 'grand-tichu', 'finished']).toContain(g.state);
    expect(stats.totalMoves).toBeGreaterThan(0);
  }, 30000);

  test('smoke: start → grand-tichu → exchange → one play succeeds', () => {
    const { game, gameId } = createFullGameTestState();
    const games = new Map();
    games.set(gameId, game);

    startGame(gameId, games, () => {});

    const g = games.get(gameId);
    expect(g.state).toBe('grand-tichu');

    runGrandTichuAndExchange(g);
    expect(g.state).toBe('playing');

    const currentPlayer = g.turnOrder[g.currentPlayerIndex];
    expect(currentPlayer).toBeDefined();
    const hand = g.hands[currentPlayer.id] || [];
    expect(hand.length).toBeGreaterThan(0);

    let move = getBotMove(g, currentPlayer.id);
    if (!move && hand.length > 0 && g.currentTrick.length === 0) {
      const card = hand.find((c) => c.name === 'mahjong') || hand[0];
      move = { cards: [card], action: 'play', mahJongWish: card.name === 'mahjong' ? '2' : null };
    }
    if (!move) move = { action: 'pass' };

    const result = makeMove(g, currentPlayer.id, move.cards || [], move.action || 'play', move.mahJongWish ?? null);
    expect(result.success).toBe(true);
  }, 10000);
});
