/**
 * Simple bot for test games - picks valid play or pass so test players are interactive.
 * Used by the server when the current player is a test player.
 */

const { validateCombination, compareCombinations } = require('./combinations');
const { getCurrentWinningPlay } = require('./trickManager');
const { getCardValue } = require('./deck');

function getSpecialValue(card) {
  const values = { mahjong: 1, dog: 0, dragon: 16 };
  return values[card?.name] || 0;
}

function cardSortValue(card) {
  if (card.type === 'standard') return getCardValue(card.rank);
  return getSpecialValue(card);
}

/**
 * Returns a valid move for the current player: { cards, action, mahJongWish } or { action: 'pass' }.
 * Returns null if not this player's turn or no valid move.
 */
function getBotMove(game, playerId) {
  const hand = game.hands?.[playerId];
  if (!hand || hand.length === 0) return null;

  const currentPlayer = game.turnOrder?.[game.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return null;

  // Dragon selection is handled by the server separately
  if (game.dragonOpponentSelection) return null;

  const isFirstTrick = !game.currentTrick?.length;

  // Lead: play a single card (prefer non–Mah Jong on first trick to avoid wish)
  if (!game.currentTrick?.length) {
    const sorted = [...hand].sort((a, b) => cardSortValue(a) - cardSortValue(b));
    for (const card of sorted) {
      if (isFirstTrick && card.name === 'mahjong') continue; // skip Mah Jong as lead on first trick
      const validation = validateCombination([card]);
      if (validation.valid) {
        const wish = isFirstTrick && card.name === 'mahjong' ? '2' : null;
        return { cards: [card], action: 'play', mahJongWish: wish };
      }
    }
    // fallback: play first card (e.g. Mah Jong with a wish)
    const card = sorted[0];
    const validation = validateCombination([card]);
    if (validation.valid) {
      const wish = isFirstTrick && card.name === 'mahjong' ? '2' : null;
      return { cards: [card], action: 'play', mahJongWish: wish };
    }
    return null;
  }

  // Following: try to beat current winning play or pass
  const winningPlay = getCurrentWinningPlay(game.currentTrick);
  if (!winningPlay) return { action: 'pass' };

  const combo = winningPlay.combination;
  if (!combo) return { action: 'pass' };

  // Try singles that beat the current play
  if (combo.type === 'single') {
    for (const card of hand) {
      const validation = validateCombination([card]);
      if (validation.valid) {
        const comparison = compareCombinations(validation, combo);
        if (comparison === 1) return { cards: [card], action: 'play', mahJongWish: null };
      }
    }
  }

  // Try pairs that beat the current play
  if (combo.type === 'pair' && hand.length >= 2) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        const pair = [hand[i], hand[j]];
        const validation = validateCombination(pair);
        if (validation.valid) {
          const comparison = compareCombinations(validation, combo);
          if (comparison === 1) return { cards: pair, action: 'play', mahJongWish: null };
        }
      }
    }
  }

  // Try triples
  if (combo.type === 'triple' && hand.length >= 3) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          const triple = [hand[i], hand[j], hand[k]];
          const validation = validateCombination(triple);
          if (validation.valid) {
            const comparison = compareCombinations(validation, combo);
            if (comparison === 1) return { cards: triple, action: 'play', mahJongWish: null };
          }
        }
      }
    }
  }

  return { action: 'pass' };
}

/**
 * Picks an opponent for Dragon (not partner). Used when a test player wins a trick with Dragon.
 */
function getDragonOpponentChoice(game, dragonPlayerId) {
  const dragonPlayer = game.players.find(p => p.id === dragonPlayerId);
  if (!dragonPlayer) return null;
  const opponents = game.players.filter(p => p.id !== dragonPlayerId && p.team !== dragonPlayer.team);
  if (opponents.length === 0) return null;
  return opponents[Math.floor(Math.random() * opponents.length)].id;
}

module.exports = {
  getBotMove,
  getDragonOpponentChoice
};
