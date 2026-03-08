/**
 * Integration tests for Mah Jong wish
 * Covers wish creation, who is restricted, starting tricks, pass, fulfillment, and edge cases.
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick, startNewTrick } = require('../../game/trickManager');
const { createTestGame, createCard, createSpecialCard } = require('../utils/testHelpers');

function baseGame(overrides = {}) {
  return createTestGame({
    state: 'playing',
    currentTrick: [],
    passedPlayers: [],
    leadPlayer: 'p1',
    currentPlayerIndex: 0,
    mahJongWish: null,
    mahJongPlayed: false,
    hands: {
      p1: [],
      p2: [],
      p3: [],
      p4: []
    },
    playersOut: [],
    dogPriorityPlayer: null,
    ...overrides
  });
}

describe('Mah Jong Wish - Creation', () => {
  test('creating wish: Mah Jong as single with valid wish (2-A) sets wish', () => {
    const game = baseGame();
    game.hands.p1 = [createSpecialCard('mahjong')];
    const result = makeMove(game, 'p1', [createSpecialCard('mahjong')], 'play', '5');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: '5', mustPlay: true });
    expect(game.mahJongPlayed).toBe(true);
  });

  test('creating wish: Mah Jong as single without wish parameter is rejected', () => {
    const game = baseGame();
    game.hands.p1 = [createSpecialCard('mahjong')];
    const result = makeMove(game, 'p1', [createSpecialCard('mahjong')], 'play');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/wish|specify/i);
  });

  test('creating wish: Mah Jong as single with invalid wish rank is rejected', () => {
    const game = baseGame();
    game.hands.p1 = [createSpecialCard('mahjong')];
    const result = makeMove(game, 'p1', [createSpecialCard('mahjong')], 'play', '1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/wish|standard|rank/i);
  });

  test('Mah Jong in straight does not create wish (straight clears previous wish)', () => {
    // When Mah Jong is played in a straight (mixed suits = regular straight, not bomb), no wish is set and any previous wish is cleared
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.mahJongPlayed = true;
    game.hands.p1 = [
      { type: 'special', name: 'mahjong' },
      { type: 'standard', rank: '2', suit: 'hearts' },
      { type: 'standard', rank: '3', suit: 'spades' },
      { type: 'standard', rank: '4', suit: 'diamonds' },
      { type: 'standard', rank: '5', suit: 'clubs' }
    ];
    const result = makeMove(game, 'p1', [
      { type: 'special', name: 'mahjong' },
      { type: 'standard', rank: '2', suit: 'hearts' },
      { type: 'standard', rank: '3', suit: 'spades' },
      { type: 'standard', rank: '4', suit: 'diamonds' },
      { type: 'standard', rank: '5', suit: 'clubs' }
    ], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
    expect(game.mahJongPlayed).toBe(true);
  });

  test('creating wish: all valid ranks 2, 10, J, Q, K, A work', () => {
    const ranks = ['2', '10', 'J', 'Q', 'K', 'A'];
    for (const rank of ranks) {
      const game = baseGame();
      game.hands.p1 = [createSpecialCard('mahjong')];
      const result = makeMove(game, 'p1', [createSpecialCard('mahjong')], 'play', rank);
      expect(result.success).toBe(true);
      expect(game.mahJongWish.wishedRank).toBe(rank);
    }
  });
});

describe('Mah Jong Wish - Starting a new trick (empty trick)', () => {
  test('lead HAS wish: must play wish as single; playing other single is rejected', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.hands.p1 = [createCard('K', 'hearts'), createCard('Q', 'hearts')];
    const wrong = makeMove(game, 'p1', [createCard('Q', 'hearts')], 'play');
    expect(wrong.success).toBe(false);
    expect(wrong.error).toMatch(/K|wish/i);
    const right = makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
    expect(right.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('lead HAS wish: playing pair instead of wish is rejected', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.hands.p1 = [createCard('K', 'hearts'), createCard('K', 'spades')];
    const result = makeMove(game, 'p1', [createCard('K', 'hearts'), createCard('K', 'spades')], 'play');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/K|single|wish/i);
  });

  test('lead DOES NOT have wish: can start with any single', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.hands.p1 = [createCard('5', 'hearts')];
    const result = makeMove(game, 'p1', [createCard('5', 'hearts')], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
  });

  test('lead DOES NOT have wish: can start with a pair', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.hands.p1 = [createCard('7', 'hearts'), createCard('7', 'spades')];
    const result = makeMove(game, 'p1', [createCard('7', 'hearts'), createCard('7', 'spades')], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
  });

  test('lead DOES NOT have wish: can start with straight (no wish restriction)', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.mahJongPlayed = true;
    game.hands.p1 = [
      { type: 'standard', rank: '5', suit: 'hearts' },
      { type: 'standard', rank: '6', suit: 'hearts' },
      { type: 'standard', rank: '7', suit: 'hearts' },
      { type: 'standard', rank: '8', suit: 'hearts' },
      { type: 'standard', rank: '9', suit: 'hearts' }
    ];
    const result = makeMove(game, 'p1', [
      { type: 'standard', rank: '5', suit: 'hearts' },
      { type: 'standard', rank: '6', suit: 'hearts' },
      { type: 'standard', rank: '7', suit: 'hearts' },
      { type: 'standard', rank: '8', suit: 'hearts' },
      { type: 'standard', rank: '9', suit: 'hearts' }
    ], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
  });

  test('lead HAS wish: playing wish in any suit clears wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'Q', mustPlay: true };
    game.hands.p1 = [createCard('Q', 'spades')];
    const result = makeMove(game, 'p1', [createCard('Q', 'spades')], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('no active wish: lead can play any valid combination', () => {
    const game = baseGame();
    game.mahJongWish = null;
    game.hands.p1 = [createCard('K', 'hearts'), createCard('K', 'spades')];
    const result = makeMove(game, 'p1', [createCard('K', 'hearts'), createCard('K', 'spades')], 'play');
    expect(result.success).toBe(true);
  });
});

describe('Mah Jong Wish - Pass', () => {
  test('player WITHOUT wish: can pass when wish is active', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '5', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('10', 'hearts')], combination: { type: 'single', cards: [createCard('10', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('J', 'hearts')];
    game.hands.p3 = [createCard('Q', 'hearts')];
    game.hands.p4 = [createCard('K', 'hearts')];
    const result = makeMove(game, 'p2', [], 'pass');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: '5', mustPlay: true });
    expect(game.currentTrick.length).toBe(1);
  });

  test('player WITH wish, wish would beat current single: cannot pass', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'Q', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('J', 'hearts')], combination: { type: 'single', cards: [createCard('J', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('Q', 'hearts')];
    const result = makeMove(game, 'p2', [], 'pass');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Q|wish|cannot pass/i);
  });

  test('player WITH wish, wish would NOT beat current single: can pass (no soft lock)', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '5', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('8', 'hearts')], combination: { type: 'single', cards: [createCard('8', 'hearts')] } }
    ];
    game.currentPlayerIndex = 2;
    game.hands.p3 = [createCard('5', 'hearts')];
    game.hands.p4 = [createCard('K', 'hearts')];
    const result = makeMove(game, 'p3', [], 'pass');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: '5', mustPlay: true });
  });

  test('player WITH wish, current play is pair: can pass (wish as single cannot beat pair)', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('J', 'hearts'), createCard('J', 'spades')], combination: { type: 'pair', cards: [] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('K', 'hearts')];
    const result = makeMove(game, 'p2', [], 'pass');
    expect(result.success).toBe(true);
  });
});

describe('Mah Jong Wish - Fulfillment and persistence', () => {
  test('playing the exact wished card as single clears the wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '7', mustPlay: true };
    game.hands.p1 = [createCard('7', 'diamonds')];
    makeMove(game, 'p1', [createCard('7', 'diamonds')], 'play');
    expect(game.mahJongWish).toBe(null);
  });

  test('BUGS.md #2: wished card played once (as single when following) clears the wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '7', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('5', 'hearts')], combination: { type: 'single', cards: [createCard('5', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('7', 'hearts')];
    makeMove(game, 'p2', [createCard('7', 'hearts')], 'play');
    expect(game.mahJongWish).toBe(null);
  });

  test('playing the wished rank in a pair does NOT clear the wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.hands.p1 = [createCard('K', 'hearts'), createCard('K', 'spades')];
    // Lead has wish - must play K as single to start trick, so playing pair would be wrong
    // Instead: lead does NOT have wish, plays pair containing K - wish should persist
    game.hands.p1 = [createCard('7', 'hearts'), createCard('7', 'spades'), createCard('K', 'hearts')];
    makeMove(game, 'p1', [createCard('7', 'hearts'), createCard('7', 'spades')], 'play');
    expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
  });

  test('wish persists across tricks until fulfilled', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('Q', 'hearts')], combination: { type: 'single' } }
    ];
    winTrick(game, 'p1');
    startNewTrick(game);
    expect(game.mahJongWish).toEqual({ wishedRank: 'K', mustPlay: true });
  });

  test('wish persists when player without wish leads with single', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '5', mustPlay: true };
    game.hands.p1 = [createCard('2', 'hearts')];
    makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
    expect(game.mahJongWish).toEqual({ wishedRank: '5', mustPlay: true });
  });
});

describe('Mah Jong Wish - Playing in the middle of a trick', () => {
  test('player WITHOUT wish can play any legal card that beats (e.g. higher single)', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '5', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('10', 'hearts')], combination: { type: 'single', cards: [createCard('10', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('J', 'hearts')];
    const result = makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toEqual({ wishedRank: '5', mustPlay: true });
  });

  test('player WITH wish can play the wish to beat current single', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'Q', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('J', 'hearts')], combination: { type: 'single', cards: [createCard('J', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('Q', 'hearts')];
    const result = makeMove(game, 'p2', [createCard('Q', 'hearts')], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('BUGS.md: player WITH wished card (7) must play it when following; playing 2 instead is rejected', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '7', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('2', 'hearts')], combination: { type: 'single', cards: [createCard('2', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('7', 'hearts'), createCard('2', 'spades')];
    const wrong = makeMove(game, 'p2', [createCard('2', 'spades')], 'play');
    expect(wrong.success).toBe(false);
    expect(wrong.error).toMatch(/wished card|7/);
    const right = makeMove(game, 'p2', [createCard('7', 'hearts')], 'play');
    expect(right.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('BUGS.md: player with bomb of 7s (wish 7) cannot play single 9 when following; must play bomb or pass', () => {
    // 7 wished, P1 played 6, P2 played 8; P3 has four 7s + 9, tries to play 9 → rejected
    const game = baseGame();
    game.mahJongWish = { wishedRank: '7', mustPlay: true };
    game.mahJongPlayed = true;
    game.leadPlayer = 'p1';
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('6', 'hearts')], combination: { type: 'single', cards: [createCard('6', 'hearts')] } },
      { playerId: 'p2', cards: [createCard('8', 'hearts')], combination: { type: 'single', cards: [createCard('8', 'hearts')] } }
    ];
    game.currentPlayerIndex = 2;
    game.hands.p3 = [
      createCard('7', 'hearts'), createCard('7', 'spades'),
      createCard('7', 'diamonds'), createCard('7', 'clubs'),
      createCard('9', 'hearts')
    ];
    const playNine = makeMove(game, 'p3', [createCard('9', 'hearts')], 'play');
    expect(playNine.success).toBe(false);
    expect(playNine.error).toMatch(/wished card|7|bomb|pass/);
    const playBomb = makeMove(game, 'p3', [
      createCard('7', 'hearts'), createCard('7', 'spades'),
      createCard('7', 'diamonds'), createCard('7', 'clubs')
    ], 'play');
    expect(playBomb.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('player WITHOUT wish can play a pair when current play is single (lead set type)', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('10', 'hearts')], combination: { type: 'single', cards: [createCard('10', 'hearts')] } }
    ];
    game.currentPlayerIndex = 1;
    game.hands.p2 = [createCard('J', 'hearts'), createCard('J', 'spades')];
    // In Tichu you must follow the combination type - so cannot play pair on single
    const result = makeMove(game, 'p2', [createCard('J', 'hearts'), createCard('J', 'spades')], 'play');
    expect(result.success).toBe(false); // Must play single to beat single
  });
});

describe('Mah Jong Wish - Edge cases', () => {
  test('hand undefined or empty: hasWishedCard is false, no restriction', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'K', mustPlay: true };
    game.hands.p1 = []; // empty hand (e.g. bug or edge case)
    // Lead with empty hand shouldn't happen in practice; ensure we don't crash
    const result = makeMove(game, 'p1', [createCard('5', 'hearts')], 'play');
    // p1 has no cards - play would fail "card not in hand"
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hand|card/i);
  });

  test('multiple players: only the one with the wish is restricted when leading', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '10', mustPlay: true };
    game.hands.p1 = [createCard('7', 'hearts')];
    game.hands.p2 = [createCard('10', 'hearts')];
    makeMove(game, 'p1', [createCard('7', 'hearts')], 'play');
    expect(game.mahJongWish).toEqual({ wishedRank: '10', mustPlay: true });
    // Later when p2 leads a new trick, p2 must play 10 - tested in "lead HAS wish"
  });

  test('wish active and lead has only the wish card: must play it', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: 'A', mustPlay: true };
    game.hands.p1 = [createCard('A', 'hearts')];
    const result = makeMove(game, 'p1', [createCard('A', 'hearts')], 'play');
    expect(result.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('wish active and lead has wish plus other cards: must play wish as single to start', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '5', mustPlay: true };
    game.hands.p1 = [createCard('5', 'hearts'), createCard('A', 'hearts')];
    const wrong = makeMove(game, 'p1', [createCard('A', 'hearts')], 'play');
    expect(wrong.success).toBe(false);
    const right = makeMove(game, 'p1', [createCard('5', 'hearts')], 'play');
    expect(right.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('player with only bomb of wished rank (four 2s) cannot pass - must play bomb or single', () => {
    // P1 plays Mah Jong and wishes 2. P2 plays 3, P3 plays 8. P4 has only four 2s (bomb).
    // P4 cannot pass; must play (bomb beats 8; single 2 would not beat 8 so only bomb is valid here).
    const game = baseGame();
    game.mahJongWish = { wishedRank: '2', mustPlay: true };
    game.mahJongPlayed = true;
    const c8 = createCard('8', 'hearts');
    game.currentTrick = [
      { playerId: 'p1', cards: [createSpecialCard('mahjong')], combination: { type: 'single', cards: [createSpecialCard('mahjong')] } },
      { playerId: 'p2', cards: [createCard('3', 'hearts')], combination: { type: 'single', cards: [createCard('3', 'hearts')] } },
      { playerId: 'p3', cards: [c8], combination: { type: 'single', cards: [c8] } }
    ];
    game.leadPlayer = 'p1';
    game.currentPlayerIndex = 3;
    game.hands.p4 = [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ];
    const passResult = makeMove(game, 'p4', [], 'pass');
    expect(passResult.success).toBe(false);
    expect(passResult.error).toMatch(/must play|cannot pass/i);
    // Playing the bomb clears the wish (single 2 would not beat 8)
    const playBomb = makeMove(game, 'p4', [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ], 'play');
    expect(playBomb.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('playing wished rank as a bomb (four-of-a-kind) clears the wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '2', mustPlay: true };
    game.mahJongPlayed = true;
    game.currentTrick = [
      { playerId: 'p1', cards: [createCard('3', 'hearts')], combination: { type: 'single', cards: [createCard('3', 'hearts')] } }
    ];
    game.leadPlayer = 'p1';
    game.currentPlayerIndex = 1;
    game.hands.p2 = [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ];
    const playResult = makeMove(game, 'p2', [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ], 'play');
    expect(playResult.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('lead with only bomb of wished rank can lead with single (one card) or bomb; both clear wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '2', mustPlay: true };
    game.mahJongPlayed = true;
    game.hands.p1 = [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ];
    // Option 1: lead with one 2 as single
    const playSingle = makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
    expect(playSingle.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });

  test('lead with bomb of wished rank: playing full bomb clears the wish', () => {
    const game = baseGame();
    game.mahJongWish = { wishedRank: '2', mustPlay: true };
    game.mahJongPlayed = true;
    game.hands.p1 = [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ];
    const playBomb = makeMove(game, 'p1', [
      createCard('2', 'hearts'), createCard('2', 'spades'),
      createCard('2', 'diamonds'), createCard('2', 'clubs')
    ], 'play');
    expect(playBomb.success).toBe(true);
    expect(game.mahJongWish).toBe(null);
  });
});
