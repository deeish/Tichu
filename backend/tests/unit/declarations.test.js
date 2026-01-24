/**
 * Unit tests for Tichu and Grand Tichu declarations
 */

const { declareGrandTichu, revealRemainingCards, declareTichu } = require('../../game/declarations');

describe('Declarations', () => {
  let game;

  beforeEach(() => {
    game = {
      state: 'grand-tichu',
      players: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      hands: {
        p1: Array(8).fill(null).map((_, i) => ({ type: 'standard', rank: '2', suit: 'hearts' })),
        p2: Array(8).fill(null).map(() => ({ type: 'standard', rank: '3', suit: 'hearts' })),
        p3: Array(8).fill(null).map(() => ({ type: 'standard', rank: '4', suit: 'hearts' })),
        p4: Array(8).fill(null).map(() => ({ type: 'standard', rank: '5', suit: 'hearts' }))
      },
      remainingCards: {
        p1: Array(6).fill(null).map(() => ({ type: 'standard', rank: '6', suit: 'hearts' })),
        p2: Array(6).fill(null).map(() => ({ type: 'standard', rank: '7', suit: 'hearts' })),
        p3: Array(6).fill(null).map(() => ({ type: 'standard', rank: '8', suit: 'hearts' })),
        p4: Array(6).fill(null).map(() => ({ type: 'standard', rank: '9', suit: 'hearts' }))
      },
      cardsRevealed: {
        p1: false,
        p2: false,
        p3: false,
        p4: false
      },
      grandTichuDeclarations: {},
      tichuDeclarations: {},
      firstCardPlayed: {}
    };
  });

  describe('declareGrandTichu', () => {
    test('should allow Grand Tichu declaration in grand-tichu phase', () => {
      const result = declareGrandTichu(game, 'p1');
      
      expect(result.success).toBe(true);
      expect(game.grandTichuDeclarations.p1).toBe(true);
      expect(game.cardsRevealed.p1).toBe(true);
    });

    test('should reveal remaining cards when declaring Grand Tichu', () => {
      const initialHandLength = game.hands.p1.length;
      declareGrandTichu(game, 'p1');
      
      expect(game.hands.p1.length).toBe(initialHandLength + 6); // 8 + 6 = 14
    });

    test('should reject Grand Tichu after cards are revealed', () => {
      game.cardsRevealed.p1 = true;
      
      const result = declareGrandTichu(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('after revealing cards');
    });

    test('should reject Grand Tichu in wrong phase', () => {
      game.state = 'playing';
      
      const result = declareGrandTichu(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('right phase');
    });
  });

  describe('revealRemainingCards', () => {
    test('should reveal remaining cards in grand-tichu phase', () => {
      const initialHandLength = game.hands.p1.length;
      const result = revealRemainingCards(game, 'p1');
      
      expect(result.success).toBe(true);
      expect(game.cardsRevealed.p1).toBe(true);
      expect(game.hands.p1.length).toBe(initialHandLength + 6);
    });

    test('should reject revealing cards in wrong phase', () => {
      game.state = 'playing';
      
      const result = revealRemainingCards(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('right phase');
    });

    test('should reject revealing cards twice', () => {
      revealRemainingCards(game, 'p1');
      
      const result = revealRemainingCards(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already revealed');
    });
  });

  describe('declareTichu', () => {
    test('should allow Tichu declaration during play', () => {
      game.state = 'playing';
      game.turnOrder = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ];
      game.currentPlayerIndex = 0;
      game.firstCardPlayed = {};
      
      const result = declareTichu(game, 'p1');
      
      expect(result.success).toBe(true);
      expect(game.tichuDeclarations.p1).toBe(true);
    });

    test('should reject Tichu declaration in wrong phase', () => {
      game.state = 'grand-tichu';
      
      const result = declareTichu(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('during play');
    });

    test('should reject Tichu after first card is played', () => {
      game.state = 'playing';
      game.firstCardPlayed.p1 = true;
      
      const result = declareTichu(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('first card');
    });

    test('should reject Tichu when not player\'s turn', () => {
      game.state = 'playing';
      game.turnOrder = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' }
      ];
      game.currentPlayerIndex = 1; // p2's turn
      game.firstCardPlayed = {};
      
      const result = declareTichu(game, 'p1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('your turn');
    });
  });
});
