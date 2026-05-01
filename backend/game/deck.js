/**
 * Deck management for Tichu
 * Creates and manages the 56-card Tichu deck
 */

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SPECIAL_CARDS = ['mahjong', 'dog', 'phoenix', 'dragon'];

/**
 * Creates a standard 52-card deck
 */
function createStandardDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        value: getCardValue(rank),
        type: 'standard'
      });
    }
  }
  return deck;
}

/**
 * Creates the special cards for Tichu
 */
function createSpecialCards() {
  return [
    { type: 'special', name: 'mahjong', value: 1, display: 'Mah Jong' },
    { type: 'special', name: 'dog', value: 0, display: 'Dog' },
    { type: 'special', name: 'phoenix', value: -25, display: 'Phoenix', isWild: true },
    { type: 'special', name: 'dragon', value: 25, display: 'Dragon' }
  ];
}

/**
 * Creates a complete Tichu deck (52 standard + 4 special)
 */
function createTichuDeck() {
  const standardDeck = createStandardDeck();
  const specialCards = createSpecialCards();
  return [...standardDeck, ...specialCards];
}

/**
 * Shuffles a deck using Fisher-Yates algorithm
 */
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Gets the numeric value of a card rank for comparison
 */
function getCardValue(rank) {
  const values = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank] || 0;
}

/**
 * Gets the point value of a card for scoring.
 * Special names are compared case-insensitively so client-sent cards (e.g. name: 'Phoenix') still score.
 */
function getCardPoints(card) {
  if (!card) return 0;
  if (card.type === 'special') {
    const name = card.name && String(card.name).toLowerCase();
    if (name === 'dragon') return 25;
    if (name === 'phoenix') return -25;
    return 0;
  }
  
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

/**
 * Deals 8 cards initially to each player (for Grand Tichu phase)
 * @param {Array} deck - The shuffled deck
 * @param {number} playersCount - Number of players (should be 4)
 * @returns {Object} { initialHands: Array, remainingCards: Array, remainingDeck: Array }
 */
function dealInitialCards(deck, playersCount = 4) {
  const initialHands = Array(playersCount).fill(null).map(() => []);
  const remainingCards = Array(playersCount).fill(null).map(() => []);
  const shuffled = shuffleDeck(deck);
  
  // Deal 8 cards initially
  for (let round = 0; round < 8; round++) {
    for (let player = 0; player < playersCount; player++) {
      if (shuffled.length > 0) {
        initialHands[player].push(shuffled.shift());
      }
    }
  }
  
  // Deal 6 more cards (to be revealed later)
  for (let round = 0; round < 6; round++) {
    for (let player = 0; player < playersCount; player++) {
      if (shuffled.length > 0) {
        remainingCards[player].push(shuffled.shift());
      }
    }
  }
  
  return {
    initialHands,
    remainingCards,
    remainingDeck: shuffled
  };
}

module.exports = {
  createTichuDeck,
  shuffleDeck,
  dealInitialCards,
  getCardValue,
  getCardPoints,
  SUITS,
  RANKS,
  SPECIAL_CARDS
};
