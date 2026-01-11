/**
 * Card combination validation for Tichu
 * Validates and compares different card combinations
 */

const { getCardValue } = require('./deck');

/**
 * Validates a card combination
 * @param {Array} cards - Array of card objects
 * @returns {Object} { valid: boolean, type: string, error: string }
 */
function validateCombination(cards) {
  if (!cards || cards.length === 0) {
    return { valid: false, error: 'No cards provided' };
  }

  // Single card
  if (cards.length === 1) {
    return { valid: true, type: 'single', cards };
  }

  // Pair
  if (cards.length === 2) {
    return validatePair(cards);
  }

  // Triple
  if (cards.length === 3) {
    return validateTriple(cards);
  }

  // Sequence of pairs (4+ cards, even number)
  if (cards.length >= 4 && cards.length % 2 === 0) {
    const sequenceOfPairs = validateSequenceOfPairs(cards);
    if (sequenceOfPairs.valid) return sequenceOfPairs;
  }

  // Full house (5 cards)
  if (cards.length === 5) {
    const fullHouse = validateFullHouse(cards);
    if (fullHouse.valid) return fullHouse;
  }

  // Bomb: Four of a kind (must check before straight flush for 4 cards)
  if (cards.length === 4) {
    const bomb = validateBomb(cards);
    if (bomb.valid) return bomb;
  }

  // Bomb: Straight flush (5+ consecutive same suit) - MUST check before regular straight
  // because a straight flush is a bomb, not a regular straight
  if (cards.length >= 5) {
    const straightFlush = validateStraightFlush(cards);
    if (straightFlush.valid) return straightFlush;
  }

  // Straight (5+ cards) - checked after straight flush
  if (cards.length >= 5) {
    const straight = validateStraight(cards);
    if (straight.valid) return straight;
  }

  return { valid: false, error: 'Invalid combination' };
}

function validatePair(cards) {
  if (cards.length !== 2) return { valid: false };
  
  const ranks = cards.map(c => c.rank || c.name);
  if (ranks[0] === ranks[1] || (cards[0].type === 'special' && cards[1].type === 'special')) {
    return { valid: true, type: 'pair', cards, rank: ranks[0] };
  }
  
  // Check for Phoenix wild card
  const phoenix = cards.find(c => c.name === 'phoenix');
  if (phoenix) {
    const otherCard = cards.find(c => c.name !== 'phoenix');
    return { valid: true, type: 'pair', cards, rank: otherCard.rank || otherCard.name, hasPhoenix: true };
  }
  
  return { valid: false, error: 'Not a valid pair' };
}

function validateTriple(cards) {
  if (cards.length !== 3) return { valid: false };
  
  const ranks = cards.map(c => c.rank || c.name).filter(r => r !== 'phoenix');
  const phoenixCount = cards.filter(c => c.name === 'phoenix').length;
  
  if (ranks.length === 0) return { valid: false };
  
  // All same rank, or 2 same + phoenix
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size === 1 || (uniqueRanks.size === 1 && phoenixCount === 1)) {
    return { valid: true, type: 'triple', cards, rank: ranks[0] };
  }
  
  return { valid: false, error: 'Not a valid triple' };
}

/**
 * Validates a sequence of pairs (e.g., J,J,Q,Q,K,K)
 * Must have at least 2 pairs (4 cards), even number of cards
 * Pairs must be of adjacent values
 * Cannot have 3 of a kind in sequences
 */
function validateSequenceOfPairs(cards) {
  // Must be even number of cards (pairs)
  if (cards.length < 4 || cards.length % 2 !== 0) {
    return { valid: false };
  }
  
  const numPairs = cards.length / 2;
  
  // Group cards by rank
  const rankGroups = {};
  cards.forEach(card => {
    if (card.type === 'special' && card.name !== 'phoenix') {
      return; // Special cards (except Phoenix) can't be in sequence of pairs
    }
    
    const rank = card.rank || (card.name === 'phoenix' ? 'phoenix' : card.name);
    if (!rankGroups[rank]) {
      rankGroups[rank] = [];
    }
    rankGroups[rank].push(card);
  });
  
  // Check that each rank appears exactly 2 times (no 3 of a kind)
  const ranks = Object.keys(rankGroups);
  for (const rank of ranks) {
    if (rankGroups[rank].length !== 2) {
      return { valid: false, error: 'Sequence of pairs cannot have 3 of a kind' };
    }
  }
  
  // Check that we have the right number of pairs
  if (ranks.length !== numPairs) {
    return { valid: false };
  }
  
  // Check that ranks are consecutive (adjacent values)
  // Convert ranks to values for comparison
  const rankValues = ranks
    .filter(r => r !== 'phoenix')
    .map(r => getCardValue(r))
    .sort((a, b) => a - b);
  
  // If we have Phoenix, we need to handle it specially
  const hasPhoenix = ranks.includes('phoenix');
  
  if (hasPhoenix && rankValues.length !== numPairs - 1) {
    // Phoenix can substitute for one rank, but we need exactly numPairs-1 other ranks
    return { valid: false };
  }
  
  // Check for consecutive sequence
  if (rankValues.length >= 2) {
    for (let i = 1; i < rankValues.length; i++) {
      if (rankValues[i] !== rankValues[i - 1] + 1) {
        return { valid: false, error: 'Pairs must be of adjacent values' };
      }
    }
  }
  
  // Get the highest rank for comparison
  const highestRank = ranks
    .filter(r => r !== 'phoenix')
    .map(r => getCardValue(r))
    .sort((a, b) => b - a)[0];
  
  return { 
    valid: true, 
    type: 'sequence-of-pairs', 
    cards, 
    numPairs,
    highestRank: Object.keys(rankGroups).find(r => getCardValue(r) === highestRank) || ranks[ranks.length - 1]
  };
}

function validateFullHouse(cards) {
  if (cards.length !== 5) return { valid: false };
  
  const ranks = cards.map(c => c.rank || c.name).filter(r => r !== 'phoenix');
  const phoenixCount = cards.filter(c => c.name === 'phoenix').length;
  const rankCounts = {};
  
  ranks.forEach(rank => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  
  // Standard full house: 3 of one rank, 2 of another
  // With Phoenix: can help form either the triple or pair
  if (counts.length === 2 && ((counts[0] === 3 && counts[1] === 2) || 
      (counts[0] === 2 && counts[1] === 2 && phoenixCount === 1))) {
    return { valid: true, type: 'fullhouse', cards };
  }
  
  return { valid: false };
}

function validateStraight(cards) {
  if (cards.length < 5) return { valid: false };
  
  // Dragon cannot be part of a sequence (rulebook)
  if (cards.some(c => c.name === 'dragon')) {
    return { valid: false };
  }
  
  // Filter out special cards (except Phoenix and Mah Jong which can be in straights)
  const standardCards = cards.filter(c => 
    c.type === 'standard' || c.name === 'phoenix' || c.name === 'mahjong'
  );
  if (standardCards.length < 5) return { valid: false };
  
  // Check if Mah Jong is included
  const hasMahJong = cards.some(c => c.name === 'mahjong');
  
  // Get values (Mah Jong = 1, Phoenix = null for now)
  const values = standardCards
    .map(c => {
      if (c.name === 'phoenix') return null;
      if (c.name === 'mahjong') return 1;
      return getCardValue(c.rank);
    })
    .filter(v => v !== null)
    .sort((a, b) => a - b);
  
  // Check for consecutive sequence
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) {
      return { valid: false };
    }
  }
  
  return { valid: true, type: 'straight', cards, length: cards.length, hasMahJong };
}

function validateBomb(cards) {
  if (cards.length !== 4) return { valid: false };
  
  const ranks = cards.map(c => c.rank || c.name).filter(r => r !== 'phoenix');
  const uniqueRanks = new Set(ranks);
  
  if (uniqueRanks.size === 1) {
    return { valid: true, type: 'bomb', cards, rank: ranks[0], bombType: 'four-of-a-kind' };
  }
  
  return { valid: false };
}

function validateStraightFlush(cards) {
  if (cards.length < 5) return { valid: false };
  
  // Phoenix cannot be used to make a bomb (rulebook: "may not be used to make a bomb!")
  if (cards.some(c => c.name === 'phoenix')) {
    return { valid: false };
  }
  
  // All cards must be same suit
  const suits = cards
    .filter(c => c.type === 'standard')
    .map(c => c.suit);
  
  if (suits.length === 0) return { valid: false };
  
  const uniqueSuits = new Set(suits);
  if (uniqueSuits.size !== 1) return { valid: false };
  
  // Check if it's also a straight (but Phoenix is already excluded above)
  const straight = validateStraight(cards);
  if (straight.valid) {
    return { valid: true, type: 'bomb', cards, bombType: 'straight-flush', length: cards.length };
  }
  
  return { valid: false };
}

/**
 * Compares two combinations to see which is higher
 * @param {Object} combo1 - First combination
 * @param {Object} combo2 - Second combination
 * @returns {number} -1 if combo1 < combo2, 0 if equal, 1 if combo1 > combo2
 */
function compareCombinations(combo1, combo2) {
  // Bombs beat everything except higher bombs
  if (combo1.type === 'bomb' && combo2.type !== 'bomb') return 1;
  if (combo2.type === 'bomb' && combo1.type !== 'bomb') return -1;
  
  // Both bombs: compare
  if (combo1.type === 'bomb' && combo2.type === 'bomb') {
    // Straight flush beats four-of-a-kind
    if (combo1.bombType === 'straight-flush' && combo2.bombType === 'four-of-a-kind') return 1;
    if (combo2.bombType === 'straight-flush' && combo1.bombType === 'four-of-a-kind') return -1;
    
    // Both are four-of-a-kind: compare by rank
    if (combo1.bombType === 'four-of-a-kind' && combo2.bombType === 'four-of-a-kind') {
      return compareRanks(combo1.rank, combo2.rank);
    }
    
    // Both are straight flush: compare by length first, then by highest card
    if (combo1.bombType === 'straight-flush' && combo2.bombType === 'straight-flush') {
      if (combo1.length > combo2.length) return 1;
      if (combo1.length < combo2.length) return -1;
      // Same length: compare by highest card
      const high1 = Math.max(...combo1.cards.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
      const high2 = Math.max(...combo2.cards.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
      return high1 > high2 ? 1 : high1 < high2 ? -1 : 0;
    }
  }
  
  // Must be same type to compare
  if (combo1.type !== combo2.type) {
    return null; // Invalid comparison
  }
  
  // Compare based on type
  switch (combo1.type) {
    case 'single':
      return compareSingles(combo1.cards[0], combo2.cards[0]);
    case 'pair':
    case 'triple':
      return compareRanks(combo1.rank, combo2.rank);
    case 'sequence-of-pairs':
      // Must have same number of pairs
      if (combo1.numPairs !== combo2.numPairs) return null;
      return compareRanks(combo1.highestRank, combo2.highestRank);
    case 'straight':
      if (combo1.length !== combo2.length) return null;
      return compareStraights(combo1.cards, combo2.cards);
    case 'fullhouse':
      return compareFullHouses(combo1.cards, combo2.cards);
    default:
      return null;
  }
}

function compareSingles(card1, card2) {
  // Handle Phoenix special value (half rank higher than card played after, or 1.5 if led)
  let val1, val2;
  
  if (card1.name === 'phoenix') {
    // Phoenix value is stored in the combination if it was played as single
    val1 = card1.phoenixValue !== undefined ? card1.phoenixValue : 1.5; // Default to 1.5 if led
  } else {
    val1 = card1.type === 'special' ? getSpecialValue(card1) : getCardValue(card1.rank);
  }
  
  if (card2.name === 'phoenix') {
    val2 = card2.phoenixValue !== undefined ? card2.phoenixValue : 1.5; // Default to 1.5 if led
  } else {
    val2 = card2.type === 'special' ? getSpecialValue(card2) : getCardValue(card2.rank);
  }
  
  return val1 > val2 ? 1 : val1 < val2 ? -1 : 0;
}

function getSpecialValue(card) {
  const values = { mahjong: 1, dog: 0, dragon: 16 };
  // Phoenix is handled separately in compareSingles
  return values[card.name] || 0;
}

/**
 * Calculates Phoenix value when played as a single card
 * @param {Object} phoenixCard - The Phoenix card
 * @param {Array} currentTrick - Current trick cards
 * @returns {number} Phoenix value
 */
function getPhoenixValue(phoenixCard, currentTrick) {
  // If Phoenix is led (trick is empty), it counts as 1.5
  if (currentTrick.length === 0) {
    return 1.5;
  }
  
  // Find the highest card played before Phoenix in this trick
  let highestValue = 0;
  for (const play of currentTrick) {
    for (const card of play.cards) {
      if (card.name === 'phoenix') {
        // If there's already a Phoenix, use its value
        if (card.phoenixValue !== undefined) {
          highestValue = Math.max(highestValue, card.phoenixValue);
        }
      } else if (card.name === 'dragon') {
        // Dragon is 16, Phoenix cannot beat it
        highestValue = Math.max(highestValue, 16);
      } else {
        const cardValue = card.type === 'special' ? getSpecialValue(card) : getCardValue(card.rank);
        highestValue = Math.max(highestValue, cardValue);
      }
    }
  }
  
  // Phoenix is half a rank higher than the highest card
  // But cannot beat Dragon (16)
  if (highestValue >= 16) {
    return 15.5; // Phoenix can beat Ace (14) but not Dragon
  }
  
  return highestValue + 0.5;
}

function compareRanks(rank1, rank2) {
  const val1 = getCardValue(rank1) || getSpecialValue({ name: rank1 });
  const val2 = getCardValue(rank2) || getSpecialValue({ name: rank2 });
  return val1 > val2 ? 1 : val1 < val2 ? -1 : 0;
}

function compareStraights(cards1, cards2) {
  // Compare highest card in straight
  const high1 = Math.max(...cards1.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
  const high2 = Math.max(...cards2.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
  return high1 > high2 ? 1 : high1 < high2 ? -1 : 0;
}

function compareFullHouses(cards1, cards2) {
  // Compare the triple rank
  // TODO: Implement full house comparison
  return 0;
}

module.exports = {
  validateCombination,
  compareCombinations,
  getPhoenixValue
};
