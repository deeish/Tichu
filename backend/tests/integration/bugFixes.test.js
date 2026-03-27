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
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.roundScores.team1).toBe(200);
      expect(game.roundScores.team2).toBe(0);
      expect(game.playersOut).toHaveLength(4); // p3, p4 added as last
      // Log tab: double-victory round shows 1st/2nd and 3rd/4th with no card breakdown; only Tichu/Grand
      expect(game.roundLog).toHaveLength(1);
      expect(game.roundLog[0].doubleVictory).toBe(true);
      const place1 = game.roundLog[0].players.find((p) => String(p.playerId) === 'p1');
      const place2 = game.roundLog[0].players.find((p) => String(p.playerId) === 'p2');
      const place3 = game.roundLog[0].players.find((p) => String(p.playerId) === 'p3');
      const place4 = game.roundLog[0].players.find((p) => String(p.playerId) === 'p4');
      expect(place1?.placement).toBe(1);
      expect(place2?.placement).toBe(2);
      expect(place1?.breakdown).toEqual([]);
      expect(place2?.breakdown).toEqual([]);
      expect(place3?.breakdown).toEqual([]);
      expect(place4?.breakdown).toEqual([]);
    });

    test('double victory still ends round when player id types differ (playersOut vs players[].id)', () => {
      // Simulate bug: first out stored as number (e.g. socket id), players[].id are strings; second player goes out as string
      const game = createTestGame({
        state: 'playing',
        playersOut: [123], // first out id as number
        players: [
          { id: '123', team: 1, name: 'P1' },
          { id: '456', team: 1, name: 'P2' },
          { id: '789', team: 2, name: 'P3' },
          { id: '999', team: 2, name: 'P4' }
        ],
        turnOrder: [
          { id: '123', team: 1, name: 'P1' },
          { id: '456', team: 1, name: 'P2' },
          { id: '789', team: 2, name: 'P3' },
          { id: '999', team: 2, name: 'P4' }
        ],
        currentTrick: [],
        passedPlayers: [],
        hands: { '123': [], '456': [], '789': [], '999': [] },
        playerStacks: { '123': { cards: [], points: 0 }, '456': { cards: [], points: 0 }, '789': { cards: [], points: 0 }, '999': { cards: [], points: 0 } },
        scores: { team1: 0, team2: 0 },
        roundScores: { team1: 0, team2: 0 },
        roundEnded: false,
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      handlePlayerWin(game, '456'); // second out (string id) -> playersOut becomes [123, '456'], length 2; lookup must match by string

      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.roundEnded).toBe(true);
      expect(game.roundScores.team1).toBe(200);
      expect(game.roundScores.team2).toBe(0);
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
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
    });

    test('tailender ends round even if earlier finishers were not listed in playersOut (hand-based check)', () => {
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
        leadPlayer: 'p4',
        currentPlayerIndex: 3,
        mahJongPlayed: true,
        firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
        hands: {
          p1: [],
          p2: [],
          p3: [createCard('Q', 'hearts'), createCard('K', 'hearts')],
          p4: [createCard('A', 'spades')]
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      const r = makeMove(game, 'p4', [createCard('A', 'spades')], 'play');
      expect(r.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.playersOut).toContain('p3');
      expect(game.playersOut).toContain('p4');
    });

    test('when third player goes out as the only play of the trick (two already out), round ends before tailender turn', () => {
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
        playersOut: ['p1', 'p2'],
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p3',
        currentPlayerIndex: 2,
        mahJongPlayed: true,
        firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
        hands: {
          p1: [],
          p2: [],
          p3: [createCard('Q', 'hearts')],
          p4: [createCard('K', 'hearts'), createCard('A', 'hearts')]
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      const r = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      expect(r.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.playersOut).toContain('p3');
      expect(game.playersOut).toContain('p4');
    });

    test('tailender forced round end: dragon trick points go to opponent, not dragon player', () => {
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
        playersOut: ['p1', 'p2'],
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p3',
        currentPlayerIndex: 2,
        mahJongPlayed: true,
        firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
        hands: {
          p1: [],
          p2: [],
          p3: [createSpecialCard('dragon')],
          p4: [createCard('3', 'clubs'), createCard('4', 'clubs')]
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      const r = makeMove(game, 'p3', [createSpecialCard('dragon')], 'play');
      expect(r.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);

      const p3StackCards = game.playerStacks?.p3?.cards || [];
      const p1StackCards = game.playerStacks?.p1?.cards || [];
      const p4StackCards = game.playerStacks?.p4?.cards || [];
      const p3HasDragon = p3StackCards.some((c) => c?.name === 'dragon');
      const opponentHasDragon =
        p1StackCards.some((c) => c?.name === 'dragon') ||
        p4StackCards.some((c) => c?.name === 'dragon');
      expect(p3HasDragon).toBe(false);
      expect(opponentHasDragon).toBe(true);
    });

    test('tailender: final play as bomb still ends round immediately (no tailender turn)', () => {
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
        playersOut: ['p1', 'p2'],
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p3',
        currentPlayerIndex: 2,
        mahJongPlayed: true,
        firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
        hands: {
          p1: [],
          p2: [],
          p3: [
            createCard('2', 'clubs'),
            createCard('2', 'diamonds'),
            createCard('2', 'hearts'),
            createCard('2', 'spades'),
          ],
          p4: [createCard('K', 'hearts'), createCard('A', 'hearts')]
        },
        scores: { team1: 0, team2: 0 },
        tichuDeclarations: {},
        grandTichuDeclarations: {}
      });

      const r = makeMove(game, 'p3', [
        createCard('2', 'clubs'),
        createCard('2', 'diamonds'),
        createCard('2', 'hearts'),
        createCard('2', 'spades'),
      ], 'play');
      expect(r.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.playersOut).toContain('p3');
      expect(game.playersOut).toContain('p4');
    });

    describe('tailender immediate end variants (same base scenario)', () => {
      function buildTailenderVariantGame(p3Hand, currentTrick) {
        return createTestGame({
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
          playersOut: ['p1', 'p2'],
          currentTrick,
          passedPlayers: [],
          leadPlayer: 'p2',
          currentPlayerIndex: 2,
          mahJongPlayed: true,
          firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
          hands: {
            p1: [],
            p2: [],
            p3: p3Hand,
            p4: [createCard('K', 'hearts'), createCard('A', 'hearts')]
          },
          scores: { team1: 0, team2: 0 },
          tichuDeclarations: {},
          grandTichuDeclarations: {}
        });
      }

      test.each([
        {
          label: 'single',
          hand: [createCard('Q', 'hearts')],
          play: [createCard('Q', 'hearts')],
        },
        {
          label: 'dragon single',
          hand: [createSpecialCard('dragon')],
          play: [createSpecialCard('dragon')],
        },
        {
          label: 'four-of-a-kind bomb',
          hand: [
            createCard('2', 'clubs'),
            createCard('2', 'diamonds'),
            createCard('2', 'hearts'),
            createCard('2', 'spades'),
          ],
          play: [
            createCard('2', 'clubs'),
            createCard('2', 'diamonds'),
            createCard('2', 'hearts'),
            createCard('2', 'spades'),
          ],
        },
      ])('variant $label: final play should still end round immediately', ({ hand, play }) => {
        const baseTrick = [
          {
            playerId: 'p2',
            cards: [createCard('9', 'spades')],
            combination: { type: 'single', cards: [createCard('9', 'spades')] },
          },
        ];
        const game = buildTailenderVariantGame(hand, baseTrick);
        const result = makeMove(game, 'p3', play, 'play');
        expect(result.success).toBe(true);
        expect(game.roundEnded).toBe(true);
        expect(['round-ended', 'round-ending-preview']).toContain(game.state);
        expect(game.playersOut).toContain('p3');
        expect(game.playersOut).toContain('p4');
      });
    });

    describe('tailender immediate end variants with prior live lead (manual-like flow)', () => {
      function buildManualLikeTailenderGame(p3Hand, p4LeadCard) {
        return createTestGame({
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
          playersOut: ['p1', 'p2'],
          currentTrick: [
            {
              playerId: 'p4',
              cards: [p4LeadCard],
              combination: { type: 'single', cards: [p4LeadCard] },
            },
          ],
          passedPlayers: [],
          leadPlayer: 'p4',
          currentPlayerIndex: 2, // p3 acts after p4 lead
          mahJongPlayed: true,
          firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
          hands: {
            p1: [],
            p2: [],
            p3: p3Hand,
            p4: [createCard('6', 'clubs')]
          },
          scores: { team1: 0, team2: 0 },
          tichuDeclarations: {},
          grandTichuDeclarations: {}
        });
      }

      test.each([
        {
          label: 'single over lead single',
          p3Hand: [createCard('Q', 'hearts')],
          p4LeadCard: createCard('9', 'spades'),
          play: [createCard('Q', 'hearts')],
        },
        {
          label: 'dragon over lead single',
          p3Hand: [createSpecialCard('dragon')],
          p4LeadCard: createCard('A', 'spades'),
          play: [createSpecialCard('dragon')],
        },
        {
          label: 'bomb over lead single',
          p3Hand: [
            createCard('2', 'clubs'),
            createCard('2', 'diamonds'),
            createCard('2', 'hearts'),
            createCard('2', 'spades'),
          ],
          p4LeadCard: createCard('A', 'spades'),
          play: [
            createCard('2', 'clubs'),
            createCard('2', 'diamonds'),
            createCard('2', 'hearts'),
            createCard('2', 'spades'),
          ],
        },
      ])('manual-like variant $label: third-out play should end round immediately', ({ p3Hand, p4LeadCard, play }) => {
        const game = buildManualLikeTailenderGame(p3Hand, p4LeadCard);
        const result = makeMove(game, 'p3', play, 'play');
        expect(result.success).toBe(true);
        expect(game.roundEnded).toBe(true);
        expect(['round-ended', 'round-ending-preview']).toContain(game.state);
        expect(game.playersOut).toContain('p3');
        expect(game.playersOut).toContain('p4');
      });
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
    test('defense: when 3 are out and trick had one play, tailender response still closes round', () => {
      const game = createTestGame({
        state: 'playing',
        playersOut: ['p1', 'p2', 'p3'],
        currentTrick: [
          {
            playerId: 'p3',
            cards: [createCard('Q', 'hearts')],
            combination: { type: 'single', cards: [createCard('Q', 'hearts')] }
          }
        ],
        passedPlayers: [],
        leadPlayer: 'p3',
        currentPlayerIndex: 3,
        hands: {
          p1: [],
          p2: [],
          p3: [],
          p4: [createCard('K', 'hearts'), createCard('A', 'hearts')]
        }
      });

      const result = makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
      expect(result.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.playersOut).toHaveLength(4);
      expect(game.playersOut).toContain('p4');
    });

    test('defense: when 3 are out and tailender passes, round still closes', () => {
      const game = createTestGame({
        state: 'playing',
        playersOut: ['p1', 'p2', 'p3'],
        currentTrick: [
          {
            playerId: 'p3',
            cards: [createCard('Q', 'hearts')],
            combination: { type: 'single', cards: [createCard('Q', 'hearts')] }
          }
        ],
        passedPlayers: [],
        leadPlayer: 'p3',
        currentPlayerIndex: 3,
        hands: {
          p1: [],
          p2: [],
          p3: [],
          p4: [createCard('K', 'hearts')]
        }
      });

      const result = makeMove(game, 'p4', [], 'pass');
      expect(result.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.playersOut).toHaveLength(4);
      expect(game.playersOut).toContain('p4');
    });

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
      // P1 played Dog as last card so they went out (recorded); trick still has the Dog for partner to play
      expect(game.playersOut).toContain('p1');
      expect(game.currentTrick.length).toBe(1);

      const pairResult = makeMove(game, 'p2', [createCard('5', 'hearts'), createCard('5', 'spades')], 'play');
      expect(pairResult.success).toBe(true);
      // P2 went out too: same team 1st+2nd → double victory, round ends, trick is cleared
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.roundScores.team1).toBe(200);
    });

    test('Going out with Dog as last card when teammate already out ends round (double victory)', () => {
      // User scenario: teammate already finished (first out), player plays Dog as last card → round must end
      const game = createTestGame({
        state: 'playing',
        currentTrick: [],
        passedPlayers: [],
        leadPlayer: 'p1',
        currentPlayerIndex: 0,
        playersOut: ['p2'], // teammate already first out
        hands: {
          p1: [createSpecialCard('dog')],
          p2: [],
          p3: [createCard('K', 'hearts')],
          p4: [createCard('A', 'hearts')]
        }
      });
      const result = makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      expect(result.success).toBe(true);
      expect(game.playersOut).toContain('p1');
      expect(game.playersOut).toContain('p2');
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.roundScores.team1).toBe(200);
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

  describe('Small Tichu: must play before pass', () => {
    test('cannot pass after declaring Tichu until first card is played', () => {
      const ninePlay = {
        playerId: 'p2',
        cards: [createCard('9', 'hearts')],
        combination: { type: 'single', cards: [createCard('9', 'hearts')] },
      };
      const game = createTestGame({
        currentTrick: [ninePlay],
        passedPlayers: [],
        leadPlayer: 'p2',
        currentPlayerIndex: 0,
        firstCardPlayed: { p2: true },
        tichuDeclarations: { p1: true },
        hands: {
          p1: [createCard('J', 'clubs'), createCard('Q', 'clubs')],
          p2: [createCard('K', 'hearts')],
          p3: [createCard('5', 'hearts')],
          p4: [createCard('6', 'hearts')],
        },
      });

      const passResult = makeMove(game, 'p1', [], 'pass');
      expect(passResult.success).toBe(false);
      expect(passResult.error).toMatch(/declared Tichu|play a card/i);

      const playResult = makeMove(game, 'p1', [createCard('J', 'clubs')], 'play');
      expect(playResult.success).toBe(true);
      expect(game.firstCardPlayed.p1).toBe(true);

      const passAfter = makeMove(game, 'p2', [], 'pass');
      expect(passAfter.success).toBe(true);
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
