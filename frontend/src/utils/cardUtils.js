/**
 * Card utility functions for sorting and grouping
 */

/**
 * Gets the numeric value of a card for sorting
 */
export function getCardSortValue(card) {
  if (card.type === 'special') {
    // Special cards: Mah Jong (1), Dog (0), Phoenix (15), Dragon (16)
    const specialValues = {
      'mahjong': 1,
      'dog': 0,
      'phoenix': 15,
      'dragon': 16
    };
    return specialValues[card.name] || 0;
  }
  
  // Standard cards: 2-10, J(11), Q(12), K(13), A(14)
  const rankValues = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankValues[card.rank] || 0;
}

/**
 * Sorts cards by rank (ascending or descending)
 */
export function sortCardsByRank(cards, ascending = true) {
  const sorted = [...cards].sort((a, b) => {
    const valA = getCardSortValue(a);
    const valB = getCardSortValue(b);
    
    if (valA !== valB) {
      return ascending ? valA - valB : valB - valA;
    }
    
    // If same rank, sort by suit
    if (a.type === 'standard' && b.type === 'standard') {
      const suitOrder = { 'spades': 0, 'hearts': 1, 'diamonds': 2, 'clubs': 3 };
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    
    return 0;
  });
  
  return sorted;
}

/**
 * Groups cards by rank
 */
function groupByRank(cards) {
  const groups = {};
  
  cards.forEach(card => {
    let key;
    if (card.type === 'special') {
      key = card.name;
    } else {
      key = card.rank;
    }
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(card);
  });
  
  return groups;
}

/**
 * Checks if cards form a straight
 */
function isStraight(cards) {
  if (cards.length < 5) return false;
  
  const standardCards = cards.filter(c => c.type === 'standard' || c.name === 'phoenix');
  if (standardCards.length < 5) return false;
  
  const values = standardCards
    .filter(c => c.name !== 'phoenix')
    .map(c => getCardSortValue(c))
    .sort((a, b) => a - b);
  
  if (values.length < 5) return false;
  
  // Check for consecutive sequence
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) {
      return false;
    }
  }
  
  return true;
}

/**
 * Checks if cards form a straight flush
 */
function isStraightFlush(cards) {
  if (cards.length < 5) return false;
  
  const standardCards = cards.filter(c => c.type === 'standard');
  if (standardCards.length < 5) return false;
  
  // Check same suit
  const suits = standardCards.map(c => c.suit);
  const uniqueSuits = new Set(suits);
  if (uniqueSuits.size !== 1) return false;
  
  return isStraight(cards);
}

/**
 * Checks if cards form a bomb (four of a kind)
 */
function isBomb(cards) {
  if (cards.length !== 4) return false;
  
  const ranks = cards
    .filter(c => c.type === 'standard')
    .map(c => c.rank);
  
  if (ranks.length !== 4) return false;
  
  const uniqueRanks = new Set(ranks);
  return uniqueRanks.size === 1;
}

/**
 * Groups cards into combinations
 */
export function groupCardsByCombinations(cards) {
  const sorted = sortCardsByRank(cards, true);
  const groups = groupByRank(sorted);
  
  const combinations = {
    singles: [],
    pairs: [],
    triples: [],
    straights: [],
    bombs: []
  };
  
  // Check for bombs first (highest priority)
  const allCards = [...sorted];
  const bombCards = [];
  for (let i = 0; i < allCards.length - 3; i++) {
    const fourCards = allCards.slice(i, i + 4);
    if (isBomb(fourCards)) {
      combinations.bombs.push(fourCards);
      // Remove these cards from further processing
      fourCards.forEach(card => {
        const index = allCards.indexOf(card);
        if (index > -1) allCards.splice(index, 1);
      });
      i = -1; // Restart loop
    }
  }
  
  // Check for straight flushes (bombs)
  const remainingForStraights = [...allCards];
  for (let len = remainingForStraights.length; len >= 5; len--) {
    for (let i = 0; i <= remainingForStraights.length - len; i++) {
      const straightCards = remainingForStraights.slice(i, i + len);
      if (isStraightFlush(straightCards)) {
        combinations.bombs.push(straightCards);
        straightCards.forEach(card => {
          const index = remainingForStraights.indexOf(card);
          if (index > -1) remainingForStraights.splice(index, 1);
        });
        i = -1;
        len = remainingForStraights.length;
      }
    }
  }
  
  // Check for regular straights
  for (let len = remainingForStraights.length; len >= 5; len--) {
    for (let i = 0; i <= remainingForStraights.length - len; i++) {
      const straightCards = remainingForStraights.slice(i, i + len);
      if (isStraight(straightCards)) {
        combinations.straights.push(straightCards);
        straightCards.forEach(card => {
          const index = remainingForStraights.indexOf(card);
          if (index > -1) remainingForStraights.splice(index, 1);
        });
        i = -1;
        len = remainingForStraights.length;
      }
    }
  }
  
  // Group remaining cards by rank
  const remainingGroups = groupByRank(remainingForStraights);
  
  Object.values(remainingGroups).forEach(group => {
    if (group.length === 1) {
      combinations.singles.push(group);
    } else if (group.length === 2) {
      combinations.pairs.push(group);
    } else if (group.length === 3) {
      combinations.triples.push(group);
    } else if (group.length >= 4) {
      // Four of a kind already handled as bomb, but if somehow missed
      combinations.bombs.push(group.slice(0, 4));
      if (group.length > 4) {
        combinations.singles.push(...group.slice(4).map(c => [c]));
      }
    }
  });
  
  return combinations;
}
