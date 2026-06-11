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
  if (!Array.isArray(cards) || cards.length === 0) {
    return { valid: false, error: 'No cards provided' };
  }

  const isValidStandardCard = (c) =>
    c != null &&
    typeof c === 'object' &&
    c.type === 'standard' &&
    typeof c.rank === 'string' &&
    typeof c.suit === 'string';

  const isValidSpecialCard = (c) =>
    c != null &&
    typeof c === 'object' &&
    c.type === 'special' &&
    typeof c.name === 'string' &&
    // Special cards supported by the ruleset/validator
    ['phoenix', 'mahjong', 'dog', 'dragon'].includes(c.name);

  // Card-element-shape safety: never allow malformed elements into the validator.
  // This prevents runtime throws from downstream logic (e.g. c.rank/c.name reads).
  for (const c of cards) {
    if (isValidStandardCard(c)) continue;
    if (isValidSpecialCard(c)) continue;
    return { valid: false, error: 'Invalid card element' };
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
  if (ranks[0] === ranks[1]) {
    return { valid: true, type: 'pair', cards, rank: ranks[0] };
  }
  
  // Check for Phoenix wild card (can only pair with a standard card)
  const phoenix = cards.find(c => c.name === 'phoenix');
  if (phoenix) {
    const otherCard = cards.find(c => c.name !== 'phoenix');
    if (!otherCard || otherCard.type !== 'standard') return { valid: false, error: 'Not a valid pair' };
    return { valid: true, type: 'pair', cards, rank: otherCard.rank, hasPhoenix: true };
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
  
  // Group cards by rank (Phoenix is handled separately)
  const rankGroups = {};
  let phoenixCount = 0;
  cards.forEach(card => {
    if (card.type === 'special' && card.name !== 'phoenix') {
      return; // Special cards (except Phoenix) can't be in sequence of pairs
    }
    
    if (card.name === 'phoenix') {
      phoenixCount++;
      return; // Phoenix handled separately
    }
    
    const rank = card.rank;
    if (!rankGroups[rank]) {
      rankGroups[rank] = [];
    }
    rankGroups[rank].push(card);
  });
  
  // Get ranks and their counts
  const ranks = Object.keys(rankGroups);
  const rankCounts = ranks.map(r => ({ rank: r, count: rankGroups[r].length }));
  
  // Phoenix can substitute for a missing card in a pair
  // We need to determine which rank Phoenix should substitute for
  // Strategy: Find ranks that have only 1 card and can form a consecutive sequence
  
  // Check for ranks with wrong counts (not 1 or 2)
  for (const rankCount of rankCounts) {
    if (rankCount.count !== 1 && rankCount.count !== 2) {
      return { valid: false, error: 'Sequence of pairs cannot have 3 of a kind' };
    }
  }
  
  // Count how many ranks need Phoenix to complete a pair (have 1 card)
  const ranksNeedingPhoenix = rankCounts.filter(rc => rc.count === 1).length;
  
  // Phoenix count must match ranks needing completion
  if (phoenixCount !== ranksNeedingPhoenix) {
    return { valid: false, error: 'Phoenix must complete pairs in sequence of pairs' };
  }
  
  // Convert ranks to values for checking consecutive sequence
  const rankValues = ranks
    .map(r => getCardValue(r))
    .sort((a, b) => a - b);
  
  // Check that we have the right number of unique ranks (should be numPairs)
  // If Phoenix is present, it will substitute for one rank, so we need numPairs unique ranks
  if (ranks.length !== numPairs) {
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
  
  // Determine Phoenix value for comparison
  // Phoenix substitutes for a rank that needs completion (has only 1 card)
  // For comparison purposes, we need to determine if Phoenix is at the top, bottom, or middle
  const maxVal = Math.max(...rankValues);
  const minVal = Math.min(...rankValues);
  
  // Find which rank Phoenix is substituting for (ranks with count 1)
  const phoenixSubstituteRanks = rankCounts.filter(rc => rc.count === 1).map(rc => rc.rank);
  
  // Determine Phoenix's position and value
  let highestValue = maxVal;
  let highestRank = ranks.find(r => getCardValue(r) === maxVal) || ranks[ranks.length - 1];
  
  if (phoenixCount > 0 && phoenixSubstituteRanks.length > 0) {
    // Phoenix is substituting for one of these ranks
    // Check if Phoenix could be at the top (substituting for max rank)
    const maxRank = ranks.find(r => getCardValue(r) === maxVal);
    const phoenixAtTop = phoenixSubstituteRanks.includes(maxRank);
    
    if (phoenixAtTop && maxVal < 14) {
      // Phoenix is at the top, value is max+1
      highestValue = maxVal + 1;
      highestRank = maxRank; // Still use the rank for comparison
    } else {
      // Phoenix is substituting for a rank that's not at the top
      // Use the actual max rank value
      highestValue = maxVal;
    }
  }
  
  return { 
    valid: true, 
    type: 'sequence-of-pairs', 
    cards, 
    numPairs,
    highestRank,
    highestValue  // Use for comparison when Phoenix is present (covers rank not in hand)
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
  // With Phoenix: (1) 2+2+P, or (2) 3+1+P (Phoenix as second of the pair rank)
  const standardFullHouse = counts.length === 2 && counts[0] === 3 && counts[1] === 2;
  const twoTwoPhoenix = counts.length === 2 && counts[0] === 2 && counts[1] === 2 && phoenixCount === 1;
  const threeOnePhoenix = counts.length === 2 && counts[0] === 3 && counts[1] === 1 && phoenixCount === 1;
  if (standardFullHouse || twoTwoPhoenix || threeOnePhoenix) {
    // Rulebook: "in full houses the value of the trio is what counts"
    let tripleRank = null;
    for (const [rank, count] of Object.entries(rankCounts)) {
      if (count === 3) {
        tripleRank = rank;
        break;
      }
    }
    // 2+2+Phoenix: Phoenix completes one pair to a triple; use higher rank as triple for comparison
    if (!tripleRank && phoenixCount === 1) {
      const pairRanks = Object.entries(rankCounts).filter(([, c]) => c === 2).map(([r]) => r);
      tripleRank = pairRanks.sort((a, b) => getCardValue(b) - getCardValue(a))[0];
    }
    // 3+1+Phoenix: triple is the rank with 3; Phoenix is the second of the pair
    if (!tripleRank && threeOnePhoenix) {
      tripleRank = Object.entries(rankCounts).find(([, c]) => c === 3)?.[0] ?? null;
    }
    if (tripleRank) return { valid: true, type: 'fullhouse', cards, tripleRank };
  }
  
  return { valid: false };
}

function validateStraight(cards) {
  if (cards.length < 5) return { valid: false };
  
  // Dragon and Dog cannot be part of a sequence (rulebook)
  if (cards.some(c => c.name === 'dragon' || c.name === 'dog')) {
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
  
  // Check for duplicate ranks (straights require unique ranks)
  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length) {
    return { valid: false, error: 'Straights cannot have duplicate ranks' };
  }
  
  const ACE_VALUE = 14;
  const hasPhoenix = cards.some(c => c.name === 'phoenix');
  const n = cards.length;
  const minVal = values[0];
  const maxVal = values[values.length - 1];
  let highestValue = maxVal;
  let phoenixValue = null;

  if (hasPhoenix && values.length === n - 1) {
    // Phoenix fills one slot. Either: (1) non-Phoenix values are consecutive → Phoenix at bottom or top, or (2) one gap → Phoenix fills the gap.
    let gapIndex = -1;
    for (let i = 1; i < values.length; i++) {
      const diff = values[i] - values[i - 1];
      if (diff > 1) {
        if (diff !== 2 || gapIndex !== -1) return { valid: false }; // multiple gaps or gap > 1
        gapIndex = i;
      }
    }
    if (gapIndex >= 0) {
      // One gap: Phoenix fills it (e.g. 8,10,J,Q,K → Phoenix = 9)
      if (maxVal - minVal !== n - 1) return { valid: false }; // span must be n-1 so one hole
      phoenixValue = values[gapIndex - 1] + 1;
      highestValue = maxVal;
    } else {
      // Consecutive: Phoenix at top (maxVal + 1) or bottom (minVal - 1)
      if (maxVal < ACE_VALUE) {
        phoenixValue = maxVal + 1;
        highestValue = maxVal + 1;
      } else if (minVal >= 2) {
        phoenixValue = minVal - 1;
        highestValue = maxVal;
      } else {
        return { valid: false }; // no valid place for Phoenix
      }
    }
  } else {
    // No Phoenix: must be consecutive
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[i - 1] + 1) {
        return { valid: false };
      }
    }
  }
  
  const result = { valid: true, type: 'straight', cards, length: cards.length, hasMahJong, highestValue };
  if (phoenixValue != null) result.phoenixValue = phoenixValue;
  return result;
}

function validateBomb(cards) {
  if (cards.length !== 4) return { valid: false };
  
  // Phoenix cannot be used to make a bomb (rulebook: "may not be used to make a bomb!")
  if (cards.some(c => c.name === 'phoenix')) {
    return { valid: false };
  }
  
  const ranks = cards.map(c => c.rank || c.name);
  const uniqueRanks = new Set(ranks);
  
  if (uniqueRanks.size === 1) {
    return { valid: true, type: 'bomb', cards, rank: ranks[0], bombType: 'four-of-a-kind' };
  }
  
  return { valid: false };
}

function validateStraightFlush(cards) {
  if (cards.length < 5) return { valid: false };
  
  // Phoenix, Mah Jong, and Dog cannot form a straight-flush bomb.
  if (cards.some(c => c.name === 'phoenix' || c.name === 'mahjong' || c.name === 'dog')) {
    return { valid: false };
  }
  
  // All cards must be same suit
  const suits = cards
    .filter(c => c.type === 'standard')
    .map(c => c.suit);
  
  if (suits.length === 0) return { valid: false };
  
  const uniqueSuits = new Set(suits);
  if (uniqueSuits.size !== 1) return { valid: false };
  
  // Check if it's also a straight (specials excluded above)
  const straight = validateStraight(cards);
  if (straight.valid) {
    // Store highestValue for comparison when straight flushes have same length
    const highestValue = Math.max(...cards.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
    return { valid: true, type: 'bomb', cards, bombType: 'straight-flush', length: cards.length, highestValue };
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
  // Defensive: comparison should never throw on missing/invalid combo shapes.
  if (!combo1 || !combo2 || typeof combo1 !== 'object' || typeof combo2 !== 'object') return null;
  if (!Array.isArray(combo1.cards) && combo1.type === 'single') return null;
  if (!Array.isArray(combo2.cards) && combo2.type === 'single') return null;

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
      // Length has priority: longer straight flush beats shorter one
      if (combo1.length > combo2.length) return 1;
      if (combo1.length < combo2.length) return -1;
      // Same length: compare by highest card value
      const high1 = combo1.highestValue != null ? combo1.highestValue : 
        Math.max(...combo1.cards.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
      const high2 = combo2.highestValue != null ? combo2.highestValue : 
        Math.max(...combo2.cards.filter(c => c.type === 'standard').map(c => getCardValue(c.rank)));
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
      // Must have same number of pairs: "sequence of two pairs only by a sequence of two higher pairs"
      if (combo1.numPairs !== combo2.numPairs) return null;
      // Use highestValue when present (handles Phoenix as top); else fall back to highestRank
      const seqHigh1 = combo1.highestValue != null ? combo1.highestValue : getCardValue(combo1.highestRank);
      const seqHigh2 = combo2.highestValue != null ? combo2.highestValue : getCardValue(combo2.highestRank);
      return seqHigh1 > seqHigh2 ? 1 : seqHigh1 < seqHigh2 ? -1 : 0;
    case 'straight':
      // Must be same length: "a sequence of eight cards only by a higher sequence of exactly eight cards"
      if (combo1.length !== combo2.length) return null;
      // Compare by highest card in the straight (includes Mah Jong=1, Phoenix as top when applicable)
      const high1 = combo1.highestValue != null ? combo1.highestValue : getStraightHighFallback(combo1.cards);
      const high2 = combo2.highestValue != null ? combo2.highestValue : getStraightHighFallback(combo2.cards);
      return high1 > high2 ? 1 : high1 < high2 ? -1 : 0;
    case 'fullhouse':
      // Rulebook: "in full houses the value of the trio is what counts" - pair is irrelevant
      return compareRanks(combo1.tripleRank, combo2.tripleRank);
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
 * Calculates Phoenix value when played as a single card.
 * Rule: Phoenix as single = (last card played + 0.5), or 1.5 if led.
 * Example: 10 is played, Phoenix on top = 10.5; Jack (11) beats it.
 * Phoenix cannot beat Dragon as a single; Dragon is the strongest single (not including bombs).
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
        if (card.phoenixValue !== undefined) {
          highestValue = Math.max(highestValue, card.phoenixValue);
        }
      } else if (card.name === 'dragon') {
        // Dragon is 16; Phoenix cannot beat Dragon as a single
        highestValue = Math.max(highestValue, 16);
      } else {
        const cardValue = card.type === 'special' ? getSpecialValue(card) : getCardValue(card.rank);
        highestValue = Math.max(highestValue, cardValue);
      }
    }
  }
  
  // Phoenix = highest + 0.5, but cannot beat Dragon (16)
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

/**
 * Fallback to compute highest card value in a straight when highestValue not on combo.
 * Handles Mah Jong (1), Phoenix (as top when it fills the high end), and standard cards.
 */
function getStraightHighFallback(cards) {
  const ACE_VALUE = 14;
  const vals = cards
    .map(c => c.name === 'mahjong' ? 1 : (c.type === 'standard' ? getCardValue(c.rank) : null))
    .filter(v => v != null);
  if (vals.length === 0) return 0;
  const maxVal = Math.max(...vals);
  const hasPhoenix = cards.some(c => c.name === 'phoenix');
  // Phoenix cannot be above Ace: Phoenix,A,K,Q,J only forms 10-J-Q-K-A, cannot beat A,K,Q,J,10
  if (hasPhoenix && vals.length === cards.length - 1 && maxVal < ACE_VALUE) {
    return maxVal + 1;
  }
  return maxVal;
}


module.exports = {
  validateCombination,
  compareCombinations,
  getPhoenixValue
};
