/**
 * Unit tests for card combination validation
 */

const { validateCombination, compareCombinations, getPhoenixValue } = require('../../game/combinations');

describe('validateCombination', () => {
  describe('Single cards', () => {
    test('should validate a single standard card', () => {
      const result = validateCombination([{ type: 'standard', rank: 'K', suit: 'hearts' }]);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('single');
    });

    test('should validate a single special card', () => {
      const result = validateCombination([{ type: 'special', name: 'dragon' }]);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('single');
    });
  });

  describe('Pairs', () => {
    test('should validate a pair of same rank', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('pair');
    });

    test('should validate a pair with Phoenix', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'special', name: 'phoenix' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('pair');
    });

    test('should reject invalid pair', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(false);
    });
  });

  describe('Sequence of Pairs', () => {
    test('should validate Phoenix, Q, J, J as sequence of pairs', () => {
      const cards = [
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('sequence-of-pairs');
      expect(result.numPairs).toBe(2);
    });

    test('should validate J, J, Q, Q sequence of pairs', () => {
      const cards = [
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'spades' },
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'standard', rank: 'Q', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('sequence-of-pairs');
    });

    test('should reject non-consecutive sequence of pairs', () => {
      const cards = [
        { type: 'standard', rank: 'J', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'spades' },
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(false);
    });
  });

  describe('Straights', () => {
    test('should validate a 5-card straight', () => {
      const cards = [
        { type: 'standard', rank: '9', suit: 'hearts' },
        { type: 'standard', rank: '10', suit: 'diamonds' },
        { type: 'standard', rank: 'J', suit: 'clubs' },
        { type: 'standard', rank: 'Q', suit: 'spades' },
        { type: 'standard', rank: 'K', suit: 'hearts' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('straight');
    });

    test('should validate straight with Mah Jong', () => {
      const cards = [
        { type: 'special', name: 'mahjong' },
        { type: 'standard', rank: '2', suit: 'hearts' },
        { type: 'standard', rank: '3', suit: 'diamonds' },
        { type: 'standard', rank: '4', suit: 'clubs' },
        { type: 'standard', rank: '5', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('straight');
    });
  });

  describe('Bombs', () => {
    test('should validate four-of-a-kind bomb', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'standard', rank: 'K', suit: 'clubs' },
        { type: 'standard', rank: 'K', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('bomb');
      expect(result.bombType).toBe('four-of-a-kind');
    });

    test('should reject bomb with Phoenix', () => {
      const cards = [
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'standard', rank: 'K', suit: 'clubs' },
        { type: 'special', name: 'phoenix' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(false);
    });
  });
});

describe('compareCombinations', () => {
  test('should compare singles correctly', () => {
    const single1 = { type: 'single', cards: [{ type: 'standard', rank: 'K', suit: 'hearts' }] };
    const single2 = { type: 'single', cards: [{ type: 'standard', rank: 'A', suit: 'hearts' }] };
    expect(compareCombinations(single2, single1)).toBe(1); // Ace beats King
  });

  test('should compare pairs correctly', () => {
    const pair1 = { type: 'pair', rank: 'J' };
    const pair2 = { type: 'pair', rank: 'Q' };
    expect(compareCombinations(pair2, pair1)).toBe(1); // Q pair beats J pair
  });

  test('should compare bombs correctly', () => {
    const bomb1 = { type: 'bomb', bombType: 'four-of-a-kind', rank: 'K' };
    const bomb2 = { type: 'bomb', bombType: 'straight-flush', length: 5, highestValue: 10 };
    expect(compareCombinations(bomb2, bomb1)).toBe(1); // Straight flush beats four-of-a-kind
  });
});

describe('getPhoenixValue', () => {
  test('should return 1.5 when Phoenix is led', () => {
    const phoenix = { type: 'special', name: 'phoenix' };
    const value = getPhoenixValue(phoenix, []);
    expect(value).toBe(1.5);
  });

  test('should return half rank higher than highest card in trick', () => {
    const phoenix = { type: 'special', name: 'phoenix' };
    const currentTrick = [{
      playerId: 'player1',
      cards: [{ type: 'standard', rank: 'K', suit: 'hearts' }],
      combination: { type: 'single' }
    }];
    const value = getPhoenixValue(phoenix, currentTrick);
    expect(value).toBe(13.5); // K is 13, so Phoenix is 13.5
  });
});
