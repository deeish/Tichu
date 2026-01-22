/**
 * Example test file showing how to use the testing utilities
 * This demonstrates the testing patterns you can use
 */

const { createTestGame, createCard, createSpecialCard, createHand } = require('./utils/testHelpers');
const { makeMove } = require('../game/moveHandler');
const { validateCombination } = require('../game/combinations');

describe('Example Tests', () => {
  test('Example: Test Phoenix sequence of pairs', () => {
    // Create cards for Phoenix, Q, J, J
    const cards = [
      createSpecialCard('phoenix'),
      createCard('Q', 'hearts'),
      createCard('J', 'hearts'),
      createCard('J', 'spades')
    ];

    const result = validateCombination(cards);
    
    expect(result.valid).toBe(true);
    expect(result.type).toBe('sequence-of-pairs');
    expect(result.numPairs).toBe(2);
  });

  test('Example: Test Dog priority flow', () => {
    const game = createTestGame({
      hands: {
        p1: [createSpecialCard('dog')],
        p2: [createCard('K', 'hearts')]
      }
    });

    // Player 1 plays Dog
    const result = makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
    
    expect(result.success).toBe(true);
    expect(game.leadPlayer).toBe('p2'); // Partner gets priority
    expect(game.dogPriorityPlayer).toBe('p2');
  });

  test('Example: Test Mah Jong wish', () => {
    const game = createTestGame({
      hands: {
        p1: [createSpecialCard('mahjong')],
        p2: [createCard('K', 'hearts')]
      }
    });

    // Player 1 plays Mah Jong with wish for King
    const result = makeMove(game, 'p1', [createSpecialCard('mahjong')], 'play', 'K');
    
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
  });
});
