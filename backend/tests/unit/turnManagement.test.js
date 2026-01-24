/**
 * Unit tests for turn management
 */

const { advanceTurn, getNextPlayerWithCards } = require('../../game/turnManagement');

describe('Turn Management', () => {
  let game;

  beforeEach(() => {
    game = {
      turnOrder: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      currentPlayerIndex: 0,
      passedPlayers: [],
      playersOut: [],
      hands: {
        p1: [{ type: 'standard', rank: 'K', suit: 'hearts' }],
        p2: [{ type: 'standard', rank: 'Q', suit: 'hearts' }],
        p3: [{ type: 'standard', rank: 'J', suit: 'hearts' }],
        p4: [{ type: 'standard', rank: '10', suit: 'hearts' }]
      }
    };
  });

  describe('advanceTurn', () => {
    test('should advance to next player', () => {
      game.currentPlayerIndex = 0;
      advanceTurn(game);
      
      expect(game.currentPlayerIndex).toBe(1); // p2
    });

    test('should wrap around to first player', () => {
      game.currentPlayerIndex = 3; // p4
      advanceTurn(game);
      
      expect(game.currentPlayerIndex).toBe(0); // p1
    });

    test('should skip passed players', () => {
      game.currentPlayerIndex = 0;
      game.passedPlayers = ['p2'];
      
      advanceTurn(game);
      
      expect(game.currentPlayerIndex).toBe(2); // p3 (skipped p2)
    });

    test('should skip players who have gone out', () => {
      game.currentPlayerIndex = 0;
      game.playersOut = ['p2'];
      
      advanceTurn(game);
      
      expect(game.currentPlayerIndex).toBe(2); // p3 (skipped p2)
    });

    test('should skip players with no cards', () => {
      game.currentPlayerIndex = 0;
      game.hands.p2 = [];
      
      advanceTurn(game);
      
      expect(game.currentPlayerIndex).toBe(2); // p3 (skipped p2)
    });

    test('should handle multiple skips', () => {
      game.currentPlayerIndex = 0;
      game.passedPlayers = ['p2'];
      game.playersOut = ['p3'];
      
      advanceTurn(game);
      
      expect(game.currentPlayerIndex).toBe(3); // p4 (skipped p2 and p3)
    });

    test('should not get stuck in infinite loop', () => {
      game.currentPlayerIndex = 0;
      game.passedPlayers = ['p1', 'p2', 'p3', 'p4'];
      
      // Should not throw or hang
      expect(() => advanceTurn(game)).not.toThrow();
    });
  });

  describe('getNextPlayerWithCards', () => {
    test('should return next player with cards', () => {
      const nextPlayer = getNextPlayerWithCards(game, 'p1');
      
      expect(nextPlayer.id).toBe('p2');
    });

    test('should wrap around to find player', () => {
      game.playersOut = ['p2', 'p3'];
      const nextPlayer = getNextPlayerWithCards(game, 'p4');
      
      expect(nextPlayer.id).toBe('p1'); // Wraps around
    });

    test('should skip players who have gone out', () => {
      game.playersOut = ['p2'];
      const nextPlayer = getNextPlayerWithCards(game, 'p1');
      
      expect(nextPlayer.id).toBe('p3'); // Skips p2
    });

    test('should skip players with no cards', () => {
      game.hands.p2 = [];
      const nextPlayer = getNextPlayerWithCards(game, 'p1');
      
      expect(nextPlayer.id).toBe('p3'); // Skips p2
    });

    test('should return null if all players have gone out', () => {
      game.playersOut = ['p1', 'p2', 'p3', 'p4'];
      const nextPlayer = getNextPlayerWithCards(game, 'p1');
      
      expect(nextPlayer).toBe(null);
    });

    test('should handle player not found in turn order', () => {
      const nextPlayer = getNextPlayerWithCards(game, 'invalid-player');
      
      // Should find first player with cards
      expect(nextPlayer).not.toBe(null);
      expect(['p1', 'p2', 'p3', 'p4']).toContain(nextPlayer.id);
    });
  });
});
