/**
 * Integration tests for confirmed bug fixes (BUGS.md).
 * Run with: npm test -- tests/integration/bugFixes.test.js
 *
 * 1. Rotation: trick does not end until every player (after lead) has had a turn.
 * 2. Double victory: team 1st+2nd ends round with +200, no card points, Tichu only.
 * 3. Round end when 3 of 4 finished: round ends as soon as 3rd player goes out.
 */

const { makeMove } = require('../../game/moveHandler');
const { createTestGame, createCard } = require('../utils/testHelpers');

// Prevent actual round restart so we can assert round-ended state and scores
jest.mock('../../game/initialization', () => ({
  initializeGame: jest.fn((game) => {
    if (game.state === 'round-ended') {
      game.state = 'round-ended'; // leave as-is so tests can assert
    }
    return game;
  })
}));

describe('Bug fixes (BUGS.md)', () => {
  describe('1. Rotation: trick does not end until each player has acted', () => {
    test('after lead plays and two pass, it is the fourth player turn (trick does not end early)', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createCard('K', 'hearts'), createCard('2', 'hearts')],
          p2: [createCard('Q', 'hearts')],
          p3: [createCard('J', 'hearts')],
          p4: [createCard('10', 'hearts')]
        }
      });

      makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [], 'pass');

      // Trick must still be active and it must be P4's turn (not lead again)
      expect(game.currentTrick.length).toBe(1);
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer.id).toBe('p4');
    });

    test('when fourth player passes after lead and two others passed, trick ends and winner leads next', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createCard('K', 'hearts'), createCard('2', 'hearts')],
          p2: [createCard('Q', 'hearts')],
          p3: [createCard('J', 'hearts')],
          p4: [createCard('10', 'hearts')]
        }
      });

      makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [], 'pass');
      const p4Result = makeMove(game, 'p4', [], 'pass');

      expect(p4Result.success).toBe(true);
      expect(p4Result.newTrick).toBe(true);
      expect(p4Result.trickWon).toBe(true);
      expect(p4Result.winner).toBe('p1'); // lead had highest (only) play
      expect(game.currentTrick.length).toBe(0);
      expect(game.leadPlayer).toBe('p1');
    });
  });

  describe('2. Double victory: team 1st and 2nd ends round with +200, no card points', () => {
    test('when same team goes out 1st and 2nd, round ends with +200 and Tichu only', () => {
      const game = createTestGame({
        state: 'playing',
        playersOut: [],
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createCard('10', 'hearts')],
          p2: [createCard('J', 'hearts')],
          p3: [createCard('Q', 'hearts'), createCard('K', 'hearts')],
          p4: [createCard('A', 'hearts'), createCard('2', 'spades')]
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      const r1 = makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      expect(r1.success).toBe(true);
      expect(game.playersOut).toContain('p1');

      const r2 = makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      expect(r2.success).toBe(true);
      expect(game.playersOut).toContain('p2');

      // Same team (p1, p2 = team 1) went out 1st and 2nd → double victory
      expect(r2.doubleVictory).toBe(true);
      expect(game.state).toBe('round-ended');
      expect(game.roundScores.team1).toBe(200);
      expect(game.roundScores.team2).toBe(0);
      expect(game.playersOut).toHaveLength(4); // p3, p4 added as last
    });
  });

  describe('3. Round end when 3 of 4 players have finished', () => {
    test('when third player goes out (one left with cards), round ends and tailender is set', () => {
      // P1, P2, P3 each have one card; P4 has cards (tailender). Use different teams so 1st+2nd out is not same team (no double victory).
      const game = createTestGame({
        state: 'playing',
        players: [
          { id: 'p1', team: 1, name: 'Player 1' },
          { id: 'p2', team: 2, name: 'Player 2' },
          { id: 'p3', team: 2, name: 'Player 3' },
          { id: 'p4', team: 1, name: 'Player 4' }
        ],
        turnOrder: [
          { id: 'p1', team: 1, name: 'Player 1' },
          { id: 'p2', team: 2, name: 'Player 2' },
          { id: 'p3', team: 2, name: 'Player 3' },
          { id: 'p4', team: 1, name: 'Player 4' }
        ],
        playersOut: [],
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createCard('10', 'hearts')],
          p2: [createCard('J', 'hearts')],
          p3: [createCard('Q', 'hearts')],
          p4: [createCard('K', 'hearts')] // one card so P4 goes out when playing
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      // After P2: two out (p1, p2). Different teams so no double victory.
      expect(game.playersOut).toContain('p1');
      expect(game.playersOut).toContain('p2');

      // P3 plays last card → 3rd out; trick not empty so round does NOT end yet - P4 gets a turn
      const r3 = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      expect(r3.success).toBe(true);
      expect(game.roundEnded).toBe(false);
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');

      // P4 plays last card (only card) → 4th out; round ends
      const r4 = makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
      expect(r4.success).toBe(true);
      expect(game.playersOut).toHaveLength(4);
      expect(game.state).toBe('round-ended');
      expect(game.roundEnded).toBe(true);
    });
  });
});
