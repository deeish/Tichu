/**
 * Extended unit tests for card combinations - covering edge cases
 */

const { validateCombination, compareCombinations } = require('../../game/combinations');

describe('Combinations - Extended Tests', () => {
  describe('Triples', () => {
    test('should validate triple of same rank', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'standard', rank: 'K', suit: 'clubs' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('triple');
    });

    test('should validate triple with Phoenix', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'special', name: 'phoenix' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('triple');
    });

    test('should reject invalid triple', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'diamonds' },
        { type: 'standard', rank: 'K', suit: 'clubs' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(false);
    });
  });

  describe('Full House', () => {
    test('should validate full house (3+2)', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'standard', rank: 'K', suit: 'clubs' },
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'diamonds' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('fullhouse');
    });

    test('should validate full house with Phoenix', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'diamonds' },
        { type: 'special', name: 'phoenix' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('fullhouse');
    });
  });

  describe('Straight Flush', () => {
    test('should validate straight flush', () => {
      const cards = [
        { type: 'standard', rank: '9', suit: 'hearts' },
        { type: 'standard', rank: '10', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'hearts' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('bomb');
      expect(result.bombType).toBe('straight-flush');
    });

    test('should reject straight flush with Phoenix', () => {
      const cards = [
        { type: 'standard', rank: '9', suit: 'hearts' },
        { type: 'standard', rank: '10', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'special', name: 'phoenix' }
      ];
      const result = validateCombination(cards);
      // Phoenix in a straight makes it a regular straight, not a bomb
      // So it should be valid as a straight, but not as a bomb
      expect(result.valid).toBe(true); // Valid as straight
      expect(result.type).toBe('straight'); // Not a bomb
      expect(result.type).not.toBe('bomb');
    });
  });

  describe('Comparison Edge Cases', () => {
    test('should compare same rank correctly', () => {
      const combo1 = { type: 'pair', rank: 'K' };
      const combo2 = { type: 'pair', rank: 'K' };
      expect(compareCombinations(combo1, combo2)).toBe(0); // Equal
    });

    test('should compare straight flushes by length first', () => {
      const shortFlush = { 
        type: 'bomb', 
        bombType: 'straight-flush', 
        length: 5, 
        highestValue: 13 
      };
      const longFlush = { 
        type: 'bomb', 
        bombType: 'straight-flush', 
        length: 6, 
        highestValue: 10 
      };
      expect(compareCombinations(longFlush, shortFlush)).toBe(1); // Longer wins
    });

    test('should compare straight flushes by highest card when same length', () => {
      const flush1 = { 
        type: 'bomb', 
        bombType: 'straight-flush', 
        length: 5, 
        highestValue: 13 
      };
      const flush2 = { 
        type: 'bomb', 
        bombType: 'straight-flush', 
        length: 5, 
        highestValue: 12 
      };
      expect(compareCombinations(flush1, flush2)).toBe(1); // Higher card wins
    });
  });

  describe('Phoenix Edge Cases', () => {
    test('should validate Phoenix in sequence of pairs at different positions', () => {
      // Phoenix, J, J, Q
      const cards1 = [
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'spades' },
        { type: 'standard', rank: 'Q', suit: 'hearts' }
      ];
      const result1 = validateCombination(cards1);
      expect(result1.valid).toBe(true);
      expect(result1.type).toBe('sequence-of-pairs');

      // J, J, Phoenix, Q
      const cards2 = [
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'spades' },
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: 'Q', suit: 'hearts' }
      ];
      const result2 = validateCombination(cards2);
      expect(result2.valid).toBe(true);
      expect(result2.type).toBe('sequence-of-pairs');
    });

    test('should reject sequence of pairs with 3 of a kind', () => {
      const cards = [
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'spades' },
        { type: 'standard', rank: 'J', suit: 'clubs' },
        { type: 'standard', rank: 'Q', suit: 'hearts' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(false);
    });
  });
});
