/**
 * Regression: tailender round-end defer when currentTrick has exactly one play
 * (scoring.js) — tailender must still get a chance to respond before round ends.
 */

jest.mock('../../game/initialization', () => ({
  initializeGame: jest.fn((g) => g),
}));

const { handlePlayerWin } = require('../../game/scoring');

describe('Tailender: defer round end when trick has single play', () => {
  function baseGame() {
    return {
      players: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' },
      ],
      playersOut: ['p1', 'p2'],
      hands: {
        p1: [],
        p2: [],
        p3: [],
        p4: [{ type: 'standard', rank: '2', suit: 'hearts' }],
      },
      playerStacks: {
        p1: { cards: [], points: 0 },
        p2: { cards: [], points: 0 },
        p3: { cards: [], points: 0 },
        p4: { cards: [], points: 0 },
      },
      tichuDeclarations: {},
      grandTichuDeclarations: {},
      scores: { team1: 0, team2: 0 },
      roundScores: { team1: 0, team2: 0 },
      roundEnded: false,
      state: 'playing',
      currentTrick: [
        {
          playerId: 'p1',
          cards: [{ type: 'standard', rank: 'K', suit: 'hearts' }],
          combination: { type: 'single', cards: [{ type: 'standard', rank: 'K', suit: 'hearts' }] },
        },
      ],
      passedPlayers: [],
      playerStats: {
        p1: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
        p2: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
        p3: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
        p4: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
      },
    };
  }

  test('does not end round immediately when third player goes out and trick has one play from another player', () => {
    const game = baseGame();
    // Valid defer case: sole trick player is someone else and still has cards to continue the trick.
    game.hands.p1 = [{ type: 'standard', rank: 'Q', suit: 'clubs' }];
    const result = handlePlayerWin(game, 'p3');

    expect(game.playersOut).toContain('p3');
    expect(result.roundEnded ?? false).toBe(false);
    expect(game.roundEnded).toBe(false);
    expect(game.state).toBe('playing');
  });

  test('ends round immediately when third player goes out on a trick that only contains their own play', () => {
    const game = baseGame();
    game.currentTrick = [
      {
        playerId: 'p3',
        cards: [{ type: 'special', name: 'phoenix' }],
        combination: { type: 'single', cards: [{ type: 'special', name: 'phoenix' }] },
      },
    ];

    const result = handlePlayerWin(game, 'p3');

    expect(game.playersOut).toContain('p3');
    expect(game.roundEnded).toBe(true);
    expect(['round-ended', 'round-ending-preview']).toContain(game.state);
    expect(game.roundEnded).toBe(true);
  });

  test('ends round when third player goes out and trick has multiple plays (non-bomb)', () => {
    const game = baseGame();
    game.currentTrick.push({
      playerId: 'p2',
      cards: [{ type: 'standard', rank: 'A', suit: 'hearts' }],
      combination: { type: 'single', cards: [{ type: 'standard', rank: 'A', suit: 'hearts' }] },
    });

    handlePlayerWin(game, 'p3');

    expect(game.roundEnded).toBe(true);
    expect(['round-ended', 'round-ending-preview']).toContain(game.state);
  });

  test('does not defer when sole trick play is from another player who already has no cards', () => {
    const game = baseGame();
    game.currentTrick = [
      {
        playerId: 'p1',
        cards: [{ type: 'special', name: 'dragon' }],
        combination: { type: 'single', cards: [{ type: 'special', name: 'dragon' }] },
      },
    ];
    game.hands.p1 = [];

    handlePlayerWin(game, 'p3');

    expect(game.roundEnded).toBe(true);
    expect(['round-ended', 'round-ending-preview']).toContain(game.state);
  });
});
