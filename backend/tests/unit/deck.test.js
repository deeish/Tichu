/**
 * Unit tests for deck management
 */

const { 
  createTichuDeck, 
  shuffleDeck, 
  dealInitialCards, 
  getCardValue, 
  getCardPoints,
  SUITS,
  RANKS,
  SPECIAL_CARDS
} = require('../../game/deck');

describe('Deck Management', () => {
  describe('createTichuDeck', () => {
    test('should create a deck with 56 cards', () => {
      const deck = createTichuDeck();
      expect(deck.length).toBe(56);
    });

    test('should have 52 standard cards', () => {
      const deck = createTichuDeck();
      const standardCards = deck.filter(c => c.type === 'standard');
      expect(standardCards.length).toBe(52);
    });

    test('should have 4 special cards', () => {
      const deck = createTichuDeck();
      const specialCards = deck.filter(c => c.type === 'special');
      expect(specialCards.length).toBe(4);
    });

    test('should have all 4 suits for each rank', () => {
      const deck = createTichuDeck();
      const standardCards = deck.filter(c => c.type === 'standard');
      
      for (const rank of RANKS) {
        const cardsOfRank = standardCards.filter(c => c.rank === rank);
        expect(cardsOfRank.length).toBe(4); // One for each suit
      }
    });

    test('should include all special cards', () => {
      const deck = createTichuDeck();
      const specialCardNames = deck
        .filter(c => c.type === 'special')
        .map(c => c.name);
      
      for (const specialName of SPECIAL_CARDS) {
        expect(specialCardNames).toContain(specialName);
      }
    });
  });

  describe('shuffleDeck', () => {
    test('should return a deck with same number of cards', () => {
      const deck = createTichuDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled.length).toBe(deck.length);
    });

    test('should contain all original cards', () => {
      const deck = createTichuDeck();
      const shuffled = shuffleDeck(deck);
      
      // Check that all cards from original deck are in shuffled deck
      for (const card of deck) {
        const found = shuffled.some(c => 
          c.type === card.type &&
          (c.type === 'standard' 
            ? c.suit === card.suit && c.rank === card.rank
            : c.name === card.name)
        );
        expect(found).toBe(true);
      }
    });

    test('should produce different order (statistically)', () => {
      const deck = createTichuDeck();
      const shuffled1 = shuffleDeck(deck);
      const shuffled2 = shuffleDeck(deck);
      
      // Very unlikely to have same order twice
      const sameOrder = shuffled1.every((card, index) => {
        const otherCard = shuffled2[index];
        return card.type === otherCard.type &&
          (card.type === 'standard'
            ? card.suit === otherCard.suit && card.rank === otherCard.rank
            : card.name === otherCard.name);
      });
      
      // This test might occasionally fail due to randomness, but it's very unlikely
      expect(sameOrder).toBe(false);
    });
  });

  describe('dealInitialCards', () => {
    test('should deal 8 cards initially to each player', () => {
      const deck = createTichuDeck();
      const { initialHands } = dealInitialCards(deck, 4);
      
      expect(initialHands.length).toBe(4);
      initialHands.forEach(hand => {
        expect(hand.length).toBe(8);
      });
    });

    test('should have 6 remaining cards per player', () => {
      const deck = createTichuDeck();
      const { remainingCards } = dealInitialCards(deck, 4);
      
      expect(remainingCards.length).toBe(4);
      remainingCards.forEach(cards => {
        expect(cards.length).toBe(6);
      });
    });

    test('should deal all 56 cards (8+6 per player * 4 players = 56)', () => {
      const deck = createTichuDeck();
      const { initialHands, remainingCards, remainingDeck } = dealInitialCards(deck, 4);
      
      const totalDealt = initialHands.reduce((sum, hand) => sum + hand.length, 0) +
                        remainingCards.reduce((sum, cards) => sum + cards.length, 0) +
                        remainingDeck.length;
      
      expect(totalDealt).toBe(56);
    });
  });

  describe('getCardValue', () => {
    test('should return correct numeric values for ranks', () => {
      expect(getCardValue('2')).toBe(2);
      expect(getCardValue('10')).toBe(10);
      expect(getCardValue('J')).toBe(11);
      expect(getCardValue('Q')).toBe(12);
      expect(getCardValue('K')).toBe(13);
      expect(getCardValue('A')).toBe(14);
    });

    test('should return 0 for invalid rank', () => {
      expect(getCardValue('invalid')).toBe(0);
    });
  });

  describe('getCardPoints', () => {
    test('should return 25 for Dragon', () => {
      const dragon = { type: 'special', name: 'dragon' };
      expect(getCardPoints(dragon)).toBe(25);
    });

    test('should return -25 for Phoenix', () => {
      const phoenix = { type: 'special', name: 'phoenix' };
      expect(getCardPoints(phoenix)).toBe(-25);
    });

    test('should return 0 for Mah Jong and Dog', () => {
      const mahJong = { type: 'special', name: 'mahjong' };
      const dog = { type: 'special', name: 'dog' };
      expect(getCardPoints(mahJong)).toBe(0);
      expect(getCardPoints(dog)).toBe(0);
    });

    test('should return 5 for rank 5', () => {
      const five = { type: 'standard', rank: '5', suit: 'hearts' };
      expect(getCardPoints(five)).toBe(5);
    });

    test('should return 10 for rank 10 and K', () => {
      const ten = { type: 'standard', rank: '10', suit: 'hearts' };
      const king = { type: 'standard', rank: 'K', suit: 'hearts' };
      expect(getCardPoints(ten)).toBe(10);
      expect(getCardPoints(king)).toBe(10);
    });

    test('should return 0 for other ranks', () => {
      const two = { type: 'standard', rank: '2', suit: 'hearts' };
      const ace = { type: 'standard', rank: 'A', suit: 'hearts' };
      expect(getCardPoints(two)).toBe(0);
      expect(getCardPoints(ace)).toBe(0);
    });
  });
});
