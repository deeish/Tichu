/**
 * Tests for special card combination rules
 * Covers: Dog (single-use only), Phoenix pairing, straight length enforcement
 */

const { validateCombination, compareCombinations } = require('../../game/combinations');

// Helpers
const std = (rank, suit = 'hearts') => ({ type: 'standard', rank, suit });
const special = (name) => ({ type: 'special', name });

const DOG = special('dog');
const PHOENIX = special('phoenix');
const DRAGON = special('dragon');
const MAHJONG = special('mahjong');

describe('Dog rules — can only be played as a single', () => {
  test('Dog alone is a valid single', () => {
    const result = validateCombination([DOG]);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('single');
  });

  test('Dog cannot pair with a standard card', () => {
    const result = validateCombination([DOG, std('K')]);
    expect(result.valid).toBe(false);
  });

  test('Dog cannot pair with Dragon', () => {
    const result = validateCombination([DOG, DRAGON]);
    expect(result.valid).toBe(false);
  });

  test('Dog cannot pair with Mahjong', () => {
    const result = validateCombination([DOG, MAHJONG]);
    expect(result.valid).toBe(false);
  });

  test('Dog cannot pair with Phoenix', () => {
    const result = validateCombination([DOG, PHOENIX]);
    expect(result.valid).toBe(false);
  });

  test('Dog cannot be part of a 5-card straight (Dog + 4 standard cards)', () => {
    const result = validateCombination([DOG, std('2'), std('3'), std('4'), std('5')]);
    expect(result.valid).toBe(false);
  });

  test('Dog cannot be part of a 6-card straight (Dog + 5 consecutive standard cards)', () => {
    // This was the core bug — Dog was silently ignored in validation but kept in length,
    // producing a fake "6-card straight"
    const result = validateCombination([DOG, std('2'), std('3'), std('4'), std('5'), std('6')]);
    expect(result.valid).toBe(false);
  });

  test('Dog cannot be part of a straight-flush bomb (Dog + 5 same-suit consecutive cards)', () => {
    const suits = ['hearts', 'hearts', 'hearts', 'hearts', 'hearts'];
    const result = validateCombination([
      DOG,
      std('2', 'hearts'), std('3', 'hearts'), std('4', 'hearts'),
      std('5', 'hearts'), std('6', 'hearts')
    ]);
    expect(result.valid).toBe(false);
  });
});

describe('Phoenix pairing rules — only pairs with standard cards', () => {
  test('Phoenix pairs with a standard card', () => {
    const result = validateCombination([PHOENIX, std('K')]);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('pair');
    expect(result.rank).toBe('K');
  });

  test('Phoenix cannot pair with Dog', () => {
    const result = validateCombination([PHOENIX, DOG]);
    expect(result.valid).toBe(false);
  });

  test('Phoenix cannot pair with Dragon', () => {
    const result = validateCombination([PHOENIX, DRAGON]);
    expect(result.valid).toBe(false);
  });

  test('Phoenix cannot pair with Mahjong', () => {
    const result = validateCombination([PHOENIX, MAHJONG]);
    expect(result.valid).toBe(false);
  });
});

describe('Straight length enforcement', () => {
  // Use mixed suits to avoid accidentally forming a straight-flush bomb
  const mixedSuits = ['hearts', 'diamonds', 'clubs', 'spades', 'hearts', 'diamonds', 'clubs'];

  test('5-card straight is valid and has correct length', () => {
    const cards = ['9','10','J','Q','K'].map((r, i) => std(r, mixedSuits[i]));
    const result = validateCombination(cards);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('straight');
    expect(result.length).toBe(5);
  });

  test('7-card straight is valid and has correct length', () => {
    const cards = ['7','8','9','10','J','Q','K'].map((r, i) => std(r, mixedSuits[i]));
    const result = validateCombination(cards);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('straight');
    expect(result.length).toBe(7);
  });

  test('compareCombinations returns null for straights of different lengths', () => {
    const s5 = { type: 'straight', length: 5, highestValue: 13 };
    const s6 = { type: 'straight', length: 6, highestValue: 14 };
    expect(compareCombinations(s6, s5)).toBeNull();
    expect(compareCombinations(s5, s6)).toBeNull();
  });

  test('higher 5-card straight beats lower 5-card straight', () => {
    const lo = { type: 'straight', length: 5, highestValue: 9 };
    const hi = { type: 'straight', length: 5, highestValue: 13 };
    expect(compareCombinations(hi, lo)).toBe(1);
    expect(compareCombinations(lo, hi)).toBe(-1);
  });

  test('equal straights compare as 0', () => {
    const s1 = { type: 'straight', length: 5, highestValue: 13 };
    const s2 = { type: 'straight', length: 5, highestValue: 13 };
    expect(compareCombinations(s1, s2)).toBe(0);
  });
});
