/**
 * Unit tests for the single-player bot (Play vs Bots).
 */

const {
  getBotMove,
  getBotExchange,
  shouldDeclareGrandTichu,
  shouldDeclareTichu,
} = require('../../game/simpleBot');
const { validateCombination } = require('../../game/combinations');
const { createTestGame, createCard, createSpecialCard } = require('../utils/testHelpers');

function trickPlay(playerId, cards) {
  return { playerId, cards, combination: validateCombination(cards) };
}

describe('simpleBot getBotMove — leading', () => {
  test('leads a multi-card combo instead of a single when one is available', () => {
    const game = createTestGame({
      hands: {
        p1: [createCard('5', 'hearts'), createCard('5', 'diamonds'), createCard('9', 'spades'), createCard('K', 'clubs')],
        p2: [], p3: [], p4: [],
      },
    });
    const move = getBotMove(game, 'p1');
    expect(move.action).toBe('play');
    expect(move.cards.length).toBe(2);
    expect(move.cards.every((c) => c.rank === '5')).toBe(true);
  });

  test('prefers the longest combo (a 5-card straight over a pair)', () => {
    const game = createTestGame({
      hands: {
        p1: [
          createCard('2', 'hearts'), createCard('3', 'diamonds'), createCard('4', 'hearts'),
          createCard('5', 'diamonds'), createCard('6', 'hearts'),
          createCard('9', 'clubs'), createCard('9', 'spades'),
        ],
        p2: [], p3: [], p4: [],
      },
    });
    const move = getBotMove(game, 'p1');
    expect(move.action).toBe('play');
    expect(move.cards.length).toBe(5);
  });

  test('never returns null when it must lead (only specials in hand)', () => {
    const game = createTestGame({
      hands: { p1: [createSpecialCard('dog')], p2: [], p3: [], p4: [] },
    });
    const move = getBotMove(game, 'p1');
    expect(move).not.toBeNull();
    expect(move.action).toBe('play');
  });
});

describe('simpleBot getBotMove — following', () => {
  test('beats a pair with the lowest beating pair', () => {
    const game = createTestGame({
      currentTrick: [trickPlay('p3', [createCard('7', 'hearts'), createCard('7', 'diamonds')])],
      leadPlayer: 'p3',
      hands: {
        p1: [createCard('9', 'hearts'), createCard('9', 'diamonds'), createCard('3', 'hearts'), createCard('3', 'diamonds')],
        p2: [], p3: [], p4: [],
      },
    });
    const move = getBotMove(game, 'p1');
    expect(move.action).toBe('play');
    expect(move.cards.length).toBe(2);
    expect(move.cards.every((c) => c.rank === '9')).toBe(true);
  });

  test('passes when it cannot beat and the trick is not worth a bomb', () => {
    const game = createTestGame({
      currentTrick: [trickPlay('p3', [createCard('A', 'hearts')])],
      leadPlayer: 'p3',
      hands: {
        p1: [createCard('4', 'hearts'), createCard('4', 'diamonds'), createCard('4', 'clubs'), createCard('4', 'spades'), createCard('9', 'hearts')],
        p2: [], p3: [], p4: [],
      },
    });
    const move = getBotMove(game, 'p1');
    expect(move.action).toBe('pass');
  });

  test('plays a bomb to grab a valuable trick from an opponent', () => {
    const game = createTestGame({
      currentTrick: [trickPlay('p3', [createCard('10', 'hearts')])],
      leadPlayer: 'p3',
      hands: {
        p1: [createCard('4', 'hearts'), createCard('4', 'diamonds'), createCard('4', 'clubs'), createCard('4', 'spades'), createCard('9', 'hearts')],
        p2: [], p3: [], p4: [],
      },
    });
    const move = getBotMove(game, 'p1');
    expect(move.action).toBe('play');
    expect(move.cards.length).toBe(4);
    expect(validateCombination(move.cards).type).toBe('bomb');
  });
});

describe('simpleBot getBotExchange', () => {
  test('gives weak cards away, keeps premiums, and sends the best of the three to the partner', () => {
    const game = createTestGame({
      hands: {
        p1: [
          createCard('A', 'hearts'), createCard('K', 'hearts'), createSpecialCard('dragon'),
          createCard('2', 'hearts'), createCard('3', 'hearts'), createCard('5', 'hearts'),
        ],
        p2: [], p3: [], p4: [],
      },
    });
    const out = getBotExchange(game, 'p1');
    expect(out.length).toBe(3);
    // No premium cards given away
    const ranks = out.map((c) => c.rank || c.name);
    expect(ranks).not.toContain('A');
    expect(ranks).not.toContain('K');
    expect(ranks).not.toContain('dragon');
    // turnOrder is [p1,p2,p3,p4]; p2 is p1's partner -> slot 0. Best of {2,3,5} = 5.
    expect(out[0].rank).toBe('5');
    expect([out[1].rank, out[2].rank].sort()).toEqual(['2', '3']);
  });
});

describe('simpleBot declarations', () => {
  test('declares Grand Tichu only on a strong 8-card hand', () => {
    const strong = [
      createSpecialCard('dragon'), createCard('A', 'hearts'), createCard('A', 'diamonds'),
      createCard('K', 'hearts'), createCard('7', 'clubs'), createCard('6', 'clubs'),
      createCard('4', 'spades'), createCard('3', 'spades'),
    ];
    const junk = ['2', '3', '4', '5', '6', '7', '8', '9'].map((r) => createCard(r, 'hearts'));
    expect(shouldDeclareGrandTichu(strong)).toBe(true);
    expect(shouldDeclareGrandTichu(junk)).toBe(false);
  });

  test('declares Tichu on a strong hand (incl. a bomb) but not on junk', () => {
    const strong = [
      createCard('4', 'hearts'), createCard('4', 'diamonds'), createCard('4', 'clubs'), createCard('4', 'spades'),
      createCard('A', 'hearts'), createCard('A', 'diamonds'),
      createCard('2', 'hearts'), createCard('3', 'hearts'),
    ];
    const junk = ['2', '3', '4', '5', '6', '7', '8', '9', '2', '3', '4', '5', '6', '7'].map((r, i) =>
      createCard(r, i % 2 ? 'hearts' : 'diamonds')
    );
    expect(shouldDeclareTichu(strong)).toBe(true);
    expect(shouldDeclareTichu(junk)).toBe(false);
  });
});
