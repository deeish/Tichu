/**
 * Unit tests for special card handling
 */

const { handleSpecialCards } = require('../../game/specialCards');

describe('Special Cards', () => {
  let game;

  beforeEach(() => {
    game = {
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
      currentTrick: [],
      hands: {
        p1: [],
        p2: [],
        p3: [],
        p4: []
      },
      playersOut: [],
      dragonPlayed: null,
      trickHistory: []
    };
  });

  describe('Dog', () => {
    test('should give priority to partner when partner has cards', () => {
      game.hands.p2 = [{ type: 'standard', rank: 'K', suit: 'hearts' }];
      
      const result = handleSpecialCards(game, 'p1', [{ type: 'special', name: 'dog' }], { type: 'single' });
      
      expect(result.success).toBe(true);
      expect(result.dogPlayed).toBe(true);
      expect(game.leadPlayer).toBe('p2');
      expect(game.dogPriorityPlayer).toBe('p2');
    });

    test('should give priority to next player if partner has gone out', () => {
      game.playersOut = ['p2'];
      game.hands.p3 = [{ type: 'standard', rank: 'K', suit: 'hearts' }];
      
      const result = handleSpecialCards(game, 'p1', [{ type: 'special', name: 'dog' }], { type: 'single' });
      
      expect(result.success).toBe(true);
      expect(game.leadPlayer).toBe('p3'); // Next player, not partner
    });

    test('should reject Dog if not played as lead card', () => {
      game.currentTrick = [
        { playerId: 'p1', cards: [{ type: 'standard', rank: 'K', suit: 'hearts' }] }
      ];
      
      const result = handleSpecialCards(game, 'p2', [{ type: 'special', name: 'dog' }], { type: 'single' });
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('lead card');
    });
  });

  describe('Dragon', () => {
    test('should track Dragon when played as single', () => {
      const result = handleSpecialCards(game, 'p1', [{ type: 'special', name: 'dragon' }], { type: 'single' });
      
      expect(result.success).toBe(true);
      expect(game.dragonPlayed).toEqual({ playerId: 'p1', trickIndex: 0 });
    });

    test('should not track Dragon when played in combination', () => {
      const result = handleSpecialCards(game, 'p1', [{ type: 'special', name: 'dragon' }], { type: 'straight' });
      
      expect(result.success).toBe(true);
      expect(game.dragonPlayed).toBe(null); // Dragon in straight doesn't trigger special rule
    });
  });
});
