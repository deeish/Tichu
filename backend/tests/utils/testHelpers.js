/**
 * Test helper utilities for creating game states and testing scenarios
 */

/**
 * Creates a minimal game state for testing
 */
function createTestGame(overrides = {}) {
  const defaultGame = {
    state: 'playing',
    players: [
      { id: 'p1', team: 1, name: 'Player 1' },
      { id: 'p2', team: 1, name: 'Player 2' },
      { id: 'p3', team: 2, name: 'Player 3' },
      { id: 'p4', team: 2, name: 'Player 4' }
    ],
    turnOrder: [
      { id: 'p1', team: 1, name: 'Player 1' },
      { id: 'p2', team: 1, name: 'Player 2' },
      { id: 'p3', team: 2, name: 'Player 3' },
      { id: 'p4', team: 2, name: 'Player 4' }
    ],
    currentPlayerIndex: 0,
    leadPlayer: 'p1',
    currentTrick: [],
    passedPlayers: [],
    hands: {
      p1: [],
      p2: [],
      p3: [],
      p4: []
    },
    playersOut: [],
    dogPriorityPlayer: null,
    mahJongWish: null,
    mahJongPlayed: false,
    firstCardPlayed: {},
    playerStacks: {
      p1: { cards: [], points: 0 },
      p2: { cards: [], points: 0 },
      p3: { cards: [], points: 0 },
      p4: { cards: [], points: 0 }
    },
    tichuDeclarations: {},
    grandTichuDeclarations: {},
    scores: { team1: 0, team2: 0 },
    roundScores: { team1: 0, team2: 0 },
    roundEnded: false,
    trickHistory: [],
    dragonPlayed: null,
    dragonOpponentSelection: null,
    mahJongPlayed: false
  };

  return { ...defaultGame, ...overrides };
}

/**
 * Creates a standard card
 */
function createCard(rank, suit) {
  return { type: 'standard', rank, suit };
}

/**
 * Creates a special card
 */
function createSpecialCard(name) {
  return { type: 'special', name };
}

/**
 * Creates a hand with specific cards
 */
function createHand(cards) {
  return cards.map(card => {
    if (typeof card === 'string') {
      // Handle special cards by name
      if (['mahjong', 'dog', 'phoenix', 'dragon'].includes(card)) {
        return createSpecialCard(card);
      }
      // Handle rank strings like 'K', 'Q', etc.
      return createCard(card, 'hearts'); // Default suit
    }
    return card;
  });
}

/**
 * Simulates a complete trick
 */
function simulateTrick(game, plays) {
  const results = [];
  for (const play of plays) {
    const result = require('../../game/moveHandler').makeMove(
      game,
      play.playerId,
      play.cards,
      play.action || 'play',
      play.mahJongWish || null
    );
    results.push(result);
    if (!result.success) break;
  }
  return results;
}

/**
 * Asserts that a game state is valid
 */
function assertValidGameState(game) {
  expect(game.players).toHaveLength(4);
  expect(game.turnOrder).toHaveLength(4);
  expect(game.currentPlayerIndex).toBeGreaterThanOrEqual(0);
  expect(game.currentPlayerIndex).toBeLessThan(4);
  expect(['playing', 'round-ended', 'finished']).toContain(game.state);
}

module.exports = {
  createTestGame,
  createCard,
  createSpecialCard,
  createHand,
  simulateTrick,
  assertValidGameState
};
