/**
 * Integration tests for confirmed bug fixes (BUGS.md).
 * Run with: npm test -- tests/integration/bugFixes.test.js
 *
 * 1. Rotation: trick does not end until every player (after lead) has had a turn.
 * 2. Double victory: team 1st+2nd ends round with +200, no card points, Tichu only.
 * 3. Round end when 3 of 4 finished: round ends as soon as 3rd player goes out.
 */

const { makeMove } = require('../../game/moveHandler');
const { handlePlayerWin } = require('../../game/scoring');
const { createTestGame, createCard, createSpecialCard } = require('../utils/testHelpers');

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

      // P3 plays last card → 3rd out; round ends immediately (tailender). P4 does not get a turn; P4's hand is discarded.
      const r3 = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      expect(r3.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(game.playersOut).toHaveLength(4); // P4 added as tailender, cannot play
      expect(game.state).toBe('round-ended');
    });
  });

  describe('4. Dog: when turn returns to Dog player, can play any hand (no soft lock)', () => {
    test('when only Dog player has cards, they get priority back and can play any combination (single, pair, etc.)', () => {
      // P1 (lead) plays Dog. Partner P2 has no cards, so getNextPlayerWithCards(p2) wraps to P1. P1 gets turn back.
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createSpecialCard('dog'), createCard('5', 'hearts'), createCard('5', 'spades')],
          p2: [],
          p3: [],
          p4: []
        }
      });

      const dogResult = makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(dogResult.success).toBe(true);
      expect(game.dogPriorityPlayer).toBe('p1'); // Turn came back to P1 (only player with cards)
      expect(game.currentTrick.length).toBe(1);
      expect(game.currentTrick[0].cards[0].name).toBe('dog');

      // With Dog priority (whether partner or self), player can play any valid combination - e.g. a pair
      const pairResult = makeMove(game, 'p1', [createCard('5', 'hearts'), createCard('5', 'spades')], 'play');
      expect(pairResult.success).toBe(true);
      expect(game.currentTrick.length).toBe(2); // Dog + pair
      expect(game.state).toBe('playing');
    });
  });

  describe('5. Dog: all scenarios', () => {
    test('Dog can only be played as lead (not when trick has cards)', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [{ playerId: 'p1', cards: [createCard('5', 'hearts')], combination: { type: 'single', cards: [] } }],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 1,
        hands: {
          p1: [createCard('2', 'hearts')],
          p2: [createSpecialCard('dog'), createCard('6', 'hearts')],
          p3: [createCard('K', 'hearts')],
          p4: [createCard('A', 'hearts')]
        }
      });
      const result = makeMove(game, 'p2', [createSpecialCard('dog')], 'play');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/lead|only.*lead/i);
    });

    test('Partner gets priority and can play any combination (e.g. pair)', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createSpecialCard('dog')],
          p2: [createCard('5', 'hearts'), createCard('5', 'spades')],
          p3: [createCard('K', 'hearts')],
          p4: [createCard('A', 'hearts')]
        }
      });
      const dogResult = makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(dogResult.success).toBe(true);
      expect(game.dogPriorityPlayer).toBe('p2'); // P1's partner
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');

      const pairResult = makeMove(game, 'p2', [createCard('5', 'hearts'), createCard('5', 'spades')], 'play');
      expect(pairResult.success).toBe(true);
      expect(game.currentTrick.length).toBe(2); // Dog + pair
    });

    test('Dog priority player cannot pass', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createSpecialCard('dog'), createCard('2', 'hearts')],
          p2: [createCard('5', 'hearts'), createCard('5', 'spades')],
          p3: [createCard('K', 'hearts')],
          p4: [createCard('A', 'hearts')]
        }
      });
      makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(game.dogPriorityPlayer).toBe('p2');
      const passResult = makeMove(game, 'p2', [], 'pass');
      expect(passResult.success).toBe(false);
      expect(passResult.error).toMatch(/priority|cannot pass|must play/i);
    });

    test('Bomb not allowed when Dog is the only card in the trick', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [{ playerId: 'p1', cards: [createSpecialCard('dog')], combination: { type: 'single', cards: [] } }],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 1,
        hands: {
          p1: [createCard('2', 'hearts')],
          p2: [
            createCard('A', 'hearts'), createCard('A', 'diamonds'),
            createCard('A', 'clubs'), createCard('A', 'spades')
          ],
          p3: [createCard('K', 'hearts')],
          p4: [createCard('Q', 'hearts')]
        }
      });
      game.dogPriorityPlayer = 'p2';
      const bombResult = makeMove(game, 'p2', [
        createCard('A', 'hearts'), createCard('A', 'diamonds'),
        createCard('A', 'clubs'), createCard('A', 'spades')
      ], 'play');
      expect(bombResult.success).toBe(false);
      expect(bombResult.error).toMatch(/bomb|dog|only card/i);
    });

    test('Partner has no cards: next player with cards gets priority and can play any combination', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createSpecialCard('dog')],
          p2: [], // partner, no cards
          p3: [createCard('7', 'hearts'), createCard('7', 'spades')],
          p4: [createCard('K', 'hearts')]
        }
      });
      const dogResult = makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(dogResult.success).toBe(true);
      expect(game.dogPriorityPlayer).toBe('p3'); // Next with cards after P2
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');

      const pairResult = makeMove(game, 'p3', [createCard('7', 'hearts'), createCard('7', 'spades')], 'play');
      expect(pairResult.success).toBe(true);
      expect(game.currentTrick.length).toBe(2);
    });

    test('After Dog-priority player plays, next player must beat or pass', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [
          { playerId: 'p1', cards: [createSpecialCard('dog')], combination: { type: 'single', cards: [] } },
          { playerId: 'p2', cards: [createCard('5', 'hearts'), createCard('5', 'spades')], combination: { type: 'pair', cards: [], rank: '5' } }
        ],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 2,
        hands: {
          p1: [createCard('2', 'hearts')],
          p2: [createCard('K', 'hearts')],
          p3: [createCard('3', 'hearts'), createCard('3', 'spades')], // pair of 3s does not beat pair of 5s
          p4: [createCard('7', 'hearts'), createCard('7', 'spades')]  // pair of 7s beats 5s
        }
      });
      const lowPairResult = makeMove(game, 'p3', [createCard('3', 'hearts'), createCard('3', 'spades')], 'play');
      expect(lowPairResult.success).toBe(false);
      expect(lowPairResult.error).toMatch(/higher|beat/i);

      const passResult = makeMove(game, 'p3', [], 'pass');
      expect(passResult.success).toBe(true);

      const highPairResult = makeMove(game, 'p4', [createCard('7', 'hearts'), createCard('7', 'spades')], 'play');
      expect(highPairResult.success).toBe(true);
    });

    test('Dog player gets turn back can play single', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createSpecialCard('dog'), createCard('10', 'hearts')],
          p2: [],
          p3: [],
          p4: []
        }
      });
      makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(game.dogPriorityPlayer).toBe('p1');
      const singleResult = makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      expect(singleResult.success).toBe(true);
      expect(game.currentTrick.length).toBe(2);
    });

    test('P1 plays Dog, teammate P2 out, P3 out, P4 out → priority back to P1, P1 can play any combination (not just singles)', () => {
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        hands: {
          p1: [createSpecialCard('dog'), createCard('7', 'hearts'), createCard('7', 'spades')],
          p2: [],
          p3: [],
          p4: []
        }
      });
      makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(game.dogPriorityPlayer).toBe('p1');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
      // P1 must be allowed to play a pair (or any combo), not restricted to singles
      const pairResult = makeMove(game, 'p1', [createCard('7', 'hearts'), createCard('7', 'spades')], 'play');
      expect(pairResult.success).toBe(true);
      expect(game.currentTrick.length).toBe(2);
    });
  });

  describe('Tichu/Grand Tichu: penalty when declarer does not get first (BUGS.md)', () => {
    test('when round ends with declarer not first, team gets -100 (not +100)', () => {
      const game = createTestGame({
        state: 'playing',
        playersOut: ['p2', 'p1', 'p3'],
        currentTrick: [],
        passedPlayers: [],
        hands: {
          p1: [],
          p2: [],
          p3: [],
          p4: [createCard('2', 'hearts')]
        },
        playerStacks: {
          p1: { cards: [], points: 20 },
          p2: { cards: [], points: 30 },
          p3: { cards: [], points: 10 },
          p4: { cards: [], points: 5 }
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: { p1: true },
        grandTichuDeclarations: {}
      });
      // p1 (team1) declared Tichu but p2 (team1) got first; p1 got second. Trigger round end by p4 going out (tailender).
      handlePlayerWin(game, 'p4');
      expect(game.roundEnded).toBe(true);
      // First place = p2, last place = p4 → p4's 5 goes to p2. Team1 stacks: p1=20, p2=30+5=35 → 55. Then Tichu: p1 declared but not first → -100. Team1 round = 55 - 100 = -45.
      expect(game.roundScores.team1).toBe(-45);
      expect(game.scores.team1).toBe(-45);
    });
  });
});
