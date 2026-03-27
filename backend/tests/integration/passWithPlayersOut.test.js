/**
 * Regression: trick must resolve when everyone who can act has passed,
 * including when one or more players are already out (fewer than 4 active).
 *
 * See docs/TURN_PASS_AND_LOCAL_RENDER_BUGS.md (Bug A).
 */

const { makeMove } = require('../../game/moveHandler');
const { validateCombination } = require('../../game/combinations');
const { createTestGame, createCard } = require('../utils/testHelpers');

describe('Pass / trick end with players already out', () => {
  test('p3 and p4 out: p1 leads, only p2 can respond; p2 passes → trick ends, p1 wins', () => {
    const game = createTestGame({
      mahJongPlayed: true,
      firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
      playersOut: ['p3', 'p4'],
      hands: {
        p1: [createCard('K', 'hearts'), createCard('2', 'clubs')],
        p2: [createCard('Q', 'hearts')],
        p3: [],
        p4: [],
      },
      leadPlayer: 'p1',
      currentPlayerIndex: 0,
      currentTrick: [],
      passedPlayers: [],
    });

    const r1 = makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
    expect(r1.success).toBe(true);
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');

    const r2 = makeMove(game, 'p2', [], 'pass');
    expect(r2.success).toBe(true);
    expect(game.currentTrick.length).toBe(0);
    expect(game.passedPlayers.length).toBe(0);
    expect(game.leadPlayer).toBe('p1');
    expect(game.playerStacks.p1.cards.length).toBeGreaterThanOrEqual(1);
  });

  test('p4 out only: p1 leads, p2 and p3 pass, p4 skipped → p1 wins trick', () => {
    const game = createTestGame({
      mahJongPlayed: true,
      firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
      playersOut: ['p4'],
      hands: {
        p1: [createCard('10', 'hearts'), createCard('J', 'hearts')],
        p2: [createCard('Q', 'hearts')],
        p3: [createCard('K', 'hearts')],
        p4: [],
      },
      leadPlayer: 'p1',
      currentPlayerIndex: 0,
      currentTrick: [],
      passedPlayers: [],
    });

    makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
    makeMove(game, 'p2', [], 'pass');
    makeMove(game, 'p3', [], 'pass');

    expect(game.currentTrick.length).toBe(0);
    expect(game.leadPlayer).toBe('p1');
  });

  test('p2 leads: p4 out — p3 and p1 pass; p2 must still have cards after lead or lead shifts (two cards so p2 stays in round)', () => {
    const game = createTestGame({
      mahJongPlayed: true,
      firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
      playersOut: ['p4'],
      hands: {
        p1: [createCard('9', 'hearts')],
        p2: [createCard('J', 'hearts'), createCard('8', 'clubs')],
        p3: [createCard('Q', 'hearts')],
        p4: [],
      },
      leadPlayer: 'p2',
      currentPlayerIndex: 1,
      currentTrick: [],
      passedPlayers: [],
    });

    makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');

    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p1', [], 'pass');
    expect(game.currentTrick.length).toBe(0);
    expect(game.leadPlayer).toBe('p2');
    expect(game.hands.p2.length).toBeGreaterThan(0);
  });

  /**
   * Regression (Bug A): empty-hand branch used `passedPlayers.length === players.length - 1` (3).
   * With one player already out, only two opponents have cards → two passes; the old guard never fired,
   * `winTrick` was skipped, trick stayed non-empty with the player marked out.
   */
  test('p4 out: all active opponents passed; winning last-card play → winTrick + out (mid-trick snapshot)', () => {
    const t10 = validateCombination([createCard('10', 'hearts')]);
    const jH = validateCombination([createCard('J', 'hearts')]);
    const game = createTestGame({
      mahJongPlayed: true,
      firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
      playersOut: ['p4'],
      hands: {
        p1: [createCard('8', 'clubs')],
        p2: [createCard('K', 'hearts')],
        p3: [createCard('7', 'diamonds')],
        p4: [],
      },
      leadPlayer: 'p1',
      currentPlayerIndex: 1,
      currentTrick: [
        { playerId: 'p3', cards: [createCard('10', 'hearts')], combination: t10 },
        { playerId: 'p1', cards: [createCard('J', 'hearts')], combination: jH },
      ],
      passedPlayers: ['p3', 'p1'],
    });

    const r = makeMove(game, 'p2', [createCard('K', 'hearts')], 'play');
    expect(r.success).toBe(true);
    expect(r.playerWon).toBe(true);
    expect(game.currentTrick.length).toBe(0);
    expect(game.playersOut).toContain('p2');
    expect(game.playerStacks.p2.cards.length).toBeGreaterThanOrEqual(3);
  });
});
