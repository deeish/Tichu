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

    test('should enforce wish when starting new trick', () => {
      game.mahJongWish = { wishedRank: 'K', mustPlay: true };
      game.hands.p1 = [{ type: 'standard', rank: 'K', suit: 'hearts' }];
      
      // Try to play wrong card
      const wrongResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'Q', suit: 'hearts' }], 'play');
      expect(wrongResult.success).toBe(false);
      
      // Play correct card
      const correctResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
      expect(correctResult.success).toBe(true);
      expect(game.mahJongWish).toBe(null); // Wish cleared
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
      
      // Player 4 should be able to play (A beats K)
      const p4Result = makeMove(game, 'p4', [{ type: 'standard', rank: 'A', suit: 'hearts' }], 'play');
      expect(p4Result.success).toBe(true);
      // Verify p4's play is in the trick
      expect(game.currentTrick.some(play => play.playerId === 'p4')).toBe(true);
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
});
