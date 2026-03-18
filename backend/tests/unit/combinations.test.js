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

    test('should validate Phoenix as a single card', () => {
      const result = validateCombination([{ type: 'special', name: 'phoenix' }]);
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

  describe('Card element shape safety', () => {
    test('should not throw and should reject when a card element is null', () => {
      expect(() => validateCombination([null])).not.toThrow();
      const result = validateCombination([null]);
      expect(result.valid).toBe(false);
    });

    test('should not throw and should reject when a card element is missing fields', () => {
      expect(() => validateCombination([{ type: 'standard', rank: 'K' }])).not.toThrow();
      const result = validateCombination([{ type: 'standard', rank: 'K' }]);
      expect(result.valid).toBe(false);
    });

    test('should not throw and should reject when a card element has wrong type fields', () => {
      expect(() => validateCombination([{ type: 'special', name: 123 }])).not.toThrow();
      const result = validateCombination([{ type: 'special', name: 123 }]);
      expect(result.valid).toBe(false);
    });

    test('should not throw and should reject when cards is not an array', () => {
      expect(() => validateCombination(null)).not.toThrow();
      const result = validateCombination(null);
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

    test('should validate straight with Phoenix filling a gap (e.g. 8, P, 10, J, Q, K)', () => {
      const cards = [
        { type: 'standard', rank: '8', suit: 'hearts' },
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: '10', suit: 'diamonds' },
        { type: 'standard', rank: 'J', suit: 'clubs' },
        { type: 'standard', rank: 'Q', suit: 'spades' },
        { type: 'standard', rank: 'K', suit: 'hearts' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('straight');
      expect(result.phoenixValue).toBe(9);
      expect(result.highestValue).toBe(13);
    });

    test('should validate straight with Phoenix at top (10, J, Q, K, P as 10-J-Q-K-A)', () => {
      const cards = [
        { type: 'standard', rank: '10', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'diamonds' },
        { type: 'standard', rank: 'Q', suit: 'clubs' },
        { type: 'standard', rank: 'K', suit: 'spades' },
        { type: 'special', name: 'phoenix' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('straight');
      expect(result.phoenixValue).toBe(14);
      expect(result.highestValue).toBe(14);
    });

    test('should reject straight with Phoenix when two gaps (e.g. 8, P, J, Q, K)', () => {
      const cards = [
        { type: 'standard', rank: '8', suit: 'hearts' },
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: 'J', suit: 'clubs' },
        { type: 'standard', rank: 'Q', suit: 'spades' },
        { type: 'standard', rank: 'K', suit: 'hearts' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(false);
    });

    test('Phoenix can fill gap anywhere in straight (9, 10, P, Q, K → Phoenix = 11)', () => {
      const cards = [
        { type: 'standard', rank: '9', suit: 'hearts' },
        { type: 'standard', rank: '10', suit: 'diamonds' },
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: 'Q', suit: 'spades' },
        { type: 'standard', rank: 'K', suit: 'hearts' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('straight');
      expect(result.phoenixValue).toBe(11);
      expect(result.highestValue).toBe(13);
    });

    test('Phoenix can be bottom of straight when top is Ace (P, A, K, Q, J → Phoenix = 10)', () => {
      const cards = [
        { type: 'special', name: 'phoenix' },
        { type: 'standard', rank: 'A', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'diamonds' },
        { type: 'standard', rank: 'Q', suit: 'clubs' },
        { type: 'standard', rank: 'J', suit: 'spades' }
      ];
      const result = validateCombination(cards);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('straight');
      expect(result.phoenixValue).toBe(10);
      expect(result.highestValue).toBe(14);
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

  test('Phoenix on 10 counts as 10.5 (last card + 0.5)', () => {
    const phoenix = { type: 'special', name: 'phoenix' };
    const currentTrick = [{
      playerId: 'p1',
      cards: [{ type: 'standard', rank: '10', suit: 'hearts' }],
      combination: { type: 'single' }
    }];
    const value = getPhoenixValue(phoenix, currentTrick);
    expect(value).toBe(10.5); // 10 + 0.5
  });

  test('Phoenix cannot beat Dragon: value capped at 15.5 when Dragon in trick', () => {
    const phoenix = { type: 'special', name: 'phoenix' };
    const currentTrick = [{
      playerId: 'p1',
      cards: [{ type: 'special', name: 'dragon' }],
      combination: { type: 'single' }
    }];
    const value = getPhoenixValue(phoenix, currentTrick);
    expect(value).toBe(15.5); // Phoenix can beat Ace (14) but not Dragon (16)
  });
});
