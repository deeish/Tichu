/**
 * Integration tests for game flows
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick, startNewTrick, getCurrentWinningPlay } = require('../../game/trickManager');

describe('Game Flow Integration Tests', () => {
  let game;

  beforeEach(() => {
    game = {
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
        p1: [
          { type: 'special', name: 'dog' },
          { type: 'standard', rank: 'K', suit: 'hearts' }
        ],
        p2: [
          { type: 'standard', rank: 'A', suit: 'hearts' },
          { type: 'standard', rank: 'Q', suit: 'spades' }
        ],
        p3: [
          { type: 'standard', rank: 'J', suit: 'hearts' }
        ],
        p4: [
          { type: 'standard', rank: '10', suit: 'hearts' }
        ]
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
      trickHistory: [],
      dragonPlayed: null,
      dragonOpponentSelection: null
    };
  });

  describe('Dog Priority Flow', () => {
    test('should give priority to partner when Dog is played', () => {
      const result = makeMove(game, 'p1', [{ type: 'special', name: 'dog' }], 'play');
      
      expect(result.success).toBe(true);
      expect(game.leadPlayer).toBe('p2'); // Partner gets priority
      expect(game.dogPriorityPlayer).toBe('p2');
      expect(game.currentPlayerIndex).toBe(1); // p2's index
    });

    test('should allow priority player to play any combination without beating Dog', () => {
      // Play Dog
      makeMove(game, 'p1', [{ type: 'special', name: 'dog' }], 'play');
      
      // Partner should be able to play any combination (even a single, since Dog is value 0)
      // Let's play a single card that beats Dog (value 0)
      const result = makeMove(game, 'p2', [
        { type: 'standard', rank: 'A', suit: 'hearts' }
      ], 'play');
      
      expect(result.success).toBe(true);
      expect(game.dogPriorityPlayer).toBe(null); // Priority cleared after playing
    });

    test('should prevent priority player from passing', () => {
      makeMove(game, 'p1', [{ type: 'special', name: 'dog' }], 'play');
      
      const result = makeMove(game, 'p2', [], 'pass');
      
      expect(result.success).toBe(false);
      // Player with Dog priority is also the lead player, so either error is valid
      expect(result.error).toMatch(/priority from Dog|lead player/);
    });
  });

  describe('Mah Jong Wish Flow', () => {
    test('should create wish when Mah Jong is played as single', () => {
      game.hands.p1 = [{ type: 'special', name: 'mahjong' }];
      
      const result = makeMove(game, 'p1', [{ type: 'special', name: 'mahjong' }], 'play', 'K');
      
      expect(result.success).toBe(true);
      expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
    });

    test('should enforce wish when starting new trick only if player HAS the wished card', () => {
      game.mahJongWish = { wishedRank: 'K', mustPlay: true };
      game.hands.p1 = [{ type: 'standard', rank: 'K', suit: 'hearts' }];

      // Try to play wrong card when they have the wish - must be rejected
      const wrongResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'Q', suit: 'hearts' }], 'play');
      expect(wrongResult.success).toBe(false);

      // Play correct card
      const correctResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
      expect(correctResult.success).toBe(true);
      expect(game.mahJongWish).toBe(null); // Wish cleared
    });

    test('player WITHOUT wished card is not restricted: can start trick with any valid combination', () => {
      game.mahJongWish = { wishedRank: 'K', mustPlay: true };
      game.currentTrick = [];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      // p1 does NOT have K - has only a pair of 7s
      game.hands.p1 = [
        { type: 'standard', rank: '7', suit: 'hearts' },
        { type: 'standard', rank: '7', suit: 'spades' }
      ];

      // Should be allowed to start the trick with a pair (not forced to play a single or the wish)
      const result = makeMove(game, 'p1', [
        { type: 'standard', rank: '7', suit: 'hearts' },
        { type: 'standard', rank: '7', suit: 'spades' }
      ], 'play');
      expect(result.success).toBe(true);
      expect(game.currentTrick.length).toBe(1);
      expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true }); // Wish still active
    });

    test('player WITHOUT wished card can pass when wish is active (no restriction)', () => {
      game.mahJongWish = { wishedRank: '5', mustPlay: true };
      game.currentTrick = [
        { playerId: 'p1', cards: [{ type: 'standard', rank: '10', suit: 'hearts' }], combination: { type: 'single', cards: [{ type: 'standard', rank: '10', suit: 'hearts' }] } }
      ];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 1;
      game.hands.p2 = [{ type: 'standard', rank: 'J', suit: 'hearts' }]; // p2 has J, not 5

      const result = makeMove(game, 'p2', [], 'pass');
      expect(result.success).toBe(true);
      expect(game.passedPlayers).toContain('p2');
    });

    test('after Mah Jong wish + bomb: tailender resolution can end round immediately', () => {
      game.hands = {
        p1: [{ type: 'special', name: 'mahjong' }],
        p2: [
          { type: 'standard', rank: '8', suit: 'hearts' },
          { type: 'standard', rank: 'A', suit: 'hearts' },
          { type: 'standard', rank: 'A', suit: 'diamonds' },
          { type: 'standard', rank: 'A', suit: 'clubs' },
          { type: 'standard', rank: 'A', suit: 'spades' }
        ],
        p3: [{ type: 'standard', rank: '9', suit: 'hearts' }],
        p4: [{ type: 'standard', rank: 'K', suit: 'hearts' }]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      game.currentTrick = [];
      game.passedPlayers = [];
      game.mahJongPlayed = false;
      game.mahJongWish = null;
      makeMove(game, 'p1', [{ type: 'special', name: 'mahjong' }], 'play', '5');
      makeMove(game, 'p2', [{ type: 'standard', rank: '8', suit: 'hearts' }], 'play');
      makeMove(game, 'p3', [{ type: 'standard', rank: '9', suit: 'hearts' }], 'play');
      makeMove(game, 'p2', [
        { type: 'standard', rank: 'A', suit: 'hearts' },
        { type: 'standard', rank: 'A', suit: 'diamonds' },
        { type: 'standard', rank: 'A', suit: 'clubs' },
        { type: 'standard', rank: 'A', suit: 'spades' }
      ], 'play');
      expect(game.leadPlayer).toBe('p2');
      // Current rules may tailender-resolve immediately here (p1/p3/p2 out, only p4 holding cards).
      expect(['round-ended', 'round-ending-preview', 'grand-tichu']).toContain(game.state);
    });

    test('should allow pass when player has wished card but it cannot beat current play (no soft lock)', () => {
      game.mahJongWish = { wishedRank: '5', mustPlay: true };
      game.currentTrick = [
        { playerId: 'p1', cards: [{ type: 'special', name: 'mahjong' }], combination: { type: 'single', cards: [{ type: 'special', name: 'mahjong' }] } },
        { playerId: 'p2', cards: [{ type: 'standard', rank: '8', suit: 'hearts' }], combination: { type: 'single', cards: [{ type: 'standard', rank: '8', suit: 'hearts' }] } }
      ];
      game.hands.p3 = [{ type: 'standard', rank: '5', suit: 'hearts' }];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 2;
      const result = makeMove(game, 'p3', [], 'pass');
      expect(result.success).toBe(true);
      expect(game.passedPlayers).toContain('p3');
    });

    test('should persist wish across tricks', () => {
      game.mahJongWish = { wishedRank: 'K', mustPlay: true };
      game.currentTrick = [
        { playerId: 'p1', cards: [{ type: 'standard', rank: 'Q', suit: 'hearts' }] }
      ];
      
      // Win trick without fulfilling wish
      winTrick(game, 'p1');
      startNewTrick(game);
      
      expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true }); // Still active
    });
  });

  describe('Rotation of Play', () => {
    test('should give all players a chance to play', () => {
      // Give p4 a card that can beat K
      game.hands.p4 = [{ type: 'standard', rank: 'A', suit: 'hearts' }];
      
      // Player 1 plays
      const p1Result = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
      expect(p1Result.success).toBe(true);
      expect(game.currentTrick.length).toBe(1);
      
      // Player 2 passes
      const p2Result = makeMove(game, 'p2', [], 'pass');
      expect(p2Result.success).toBe(true);
      expect(game.currentTrick.length).toBe(1); // Trick still active
      
      // Player 3 passes
      const p3Result = makeMove(game, 'p3', [], 'pass');
      expect(p3Result.success).toBe(true);
      
      // After p3 passes, p4 should be the current player (index 3)
      // The trick should still be active, so p4 should get a turn
      expect(game.currentPlayerIndex).toBe(3); // p4's index
      expect(game.currentTrick.length).toBeGreaterThan(0); // Trick still active
      
      // Player 4 plays A (beats K) and goes out. Current holder is P4 so P1, P2, P3 each get a chance to respond before trick ends.
      const p4Result = makeMove(game, 'p4', [{ type: 'standard', rank: 'A', suit: 'hearts' }], 'play');
      expect(p4Result.success).toBe(true);
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
      makeMove(game, 'p1', [], 'pass');
      makeMove(game, 'p2', [], 'pass');
      const p3Pass = makeMove(game, 'p3', [], 'pass');
      expect(p3Pass.newTrick).toBe(true);
      expect(game.currentTrick.length).toBe(0);
      // P4 went out so next trick is led by first player with cards (P1)
      expect(game.leadPlayer).toBe('p1');
    });
  });

  describe('Priority After Winning Hand', () => {
    test('should give priority to next player when winner has no cards', () => {
      game.leadPlayer = 'p1';
      game.playersOut = ['p1']; // p1 has gone out
      game.hands.p1 = []; // No cards
      
      startNewTrick(game);
      
      expect(game.leadPlayer).toBe('p2'); // Next player in turn order
      expect(game.currentPlayerIndex).toBe(1); // p2's index
    });
  });

  describe('Phoenix as single', () => {
    test('Phoenix on 10 counts as 10.5; Jack (11) can beat it', () => {
      // P1 and P2 must have 2 cards each so they don't go out when they play; otherwise when P3
      // goes out we'd have 3 out (tailender) and the round would end, clearing currentTrick.
      game.players = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 2, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 1, name: 'Player 4' }
      ];
      game.turnOrder = [...game.players];
      game.mahJongPlayed = true;
      game.hands = {
        p1: [{ type: 'standard', rank: '10', suit: 'hearts' }, { type: 'standard', rank: '2', suit: 'spades' }],
        p2: [{ type: 'special', name: 'phoenix' }, { type: 'standard', rank: '3', suit: 'clubs' }],
        p3: [{ type: 'standard', rank: 'J', suit: 'hearts' }],
        p4: [{ type: 'standard', rank: 'Q', suit: 'hearts' }]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      game.currentTrick = [];
      game.passedPlayers = [];

      const p1Result = makeMove(game, 'p1', [{ type: 'standard', rank: '10', suit: 'hearts' }], 'play');
      expect(p1Result.success).toBe(true);
      const p2Result = makeMove(game, 'p2', [{ type: 'special', name: 'phoenix' }], 'play');
      expect(p2Result.success).toBe(true);
      expect(game.currentTrick.length).toBe(2);
      const winningPlay = getCurrentWinningPlay(game.currentTrick);
      expect(winningPlay.playerId).toBe('p2');
      expect(game.currentTrick[1].cards[0].phoenixValue).toBe(10.5);

      const p3Result = makeMove(game, 'p3', [{ type: 'standard', rank: 'J', suit: 'hearts' }], 'play');
      expect(p3Result.success).toBe(true);
      expect(getCurrentWinningPlay(game.currentTrick).playerId).toBe('p3');
    });

    test('Phoenix cannot beat Dragon as single (Dragon is strongest single, not including bombs)', () => {
      game.mahJongPlayed = true;
      game.hands = {
        p1: [{ type: 'special', name: 'dragon' }],
        p2: [{ type: 'special', name: 'phoenix' }],
        p3: [{ type: 'standard', rank: 'A', suit: 'hearts' }],
        p4: [{ type: 'standard', rank: 'K', suit: 'hearts' }]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      game.currentTrick = [];
      game.passedPlayers = [];

      makeMove(game, 'p1', [{ type: 'special', name: 'dragon' }], 'play');
      const p2Result = makeMove(game, 'p2', [{ type: 'special', name: 'phoenix' }], 'play');
      expect(p2Result.success).toBe(false);
      expect(p2Result.error).toMatch(/beat|higher|pass/i);
    });
  });
});
