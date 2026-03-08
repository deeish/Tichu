/**
 * Simple bot for test games - picks valid play or pass so test players are interactive.
 * Used by the server when the current player is a test player.
 * Ensures a valid move whenever the player must act (lead, dog priority, must play wished card).
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

/** Returns lowest valid single play (for dog-only trick or fallback). */
function playLowestSingle(hand) {
  const sorted = [...hand].sort((a, b) => cardSortValue(a) - cardSortValue(b));
  for (const card of sorted) {
    const validation = validateCombination([card]);
    if (validation.valid) return { cards: [card], action: 'play', mahJongWish: null };
  }
  return null;
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

  // Lead: play a single card. Never return null when we have cards (lead must play).
  if (!game.currentTrick?.length) {
    const mustPlayMahJong = !game.mahJongPlayed && game.leadPlayer === playerId && hand.some((c) => c.name === 'mahjong');
    if (mustPlayMahJong) {
      const mahjong = hand.find((c) => c.name === 'mahjong');
      const validation = validateCombination([mahjong]);
      if (validation.valid) return { cards: [mahjong], action: 'play', mahJongWish: '2' };
    }
    // Must play wished card when we have it and wish is active (e.g. starting trick after wish)
    const wishedRank = game.mahJongWish?.wishedRank;
    if (game.mahJongWish?.mustPlay && wishedRank) {
      const wishedCard = hand.find((c) => c.type === 'standard' && c.rank === wishedRank);
      if (wishedCard) {
        const validation = validateCombination([wishedCard]);
        if (validation.valid) return { cards: [wishedCard], action: 'play', mahJongWish: null };
      }
    }
    const sorted = [...hand].sort((a, b) => cardSortValue(a) - cardSortValue(b));
    for (const card of sorted) {
      if (isFirstTrick && card.name === 'mahjong') continue; // prefer non–Mah Jong on first trick when not required
      const validation = validateCombination([card]);
      if (validation.valid) {
        const wish = isFirstTrick && card.name === 'mahjong' ? '2' : null;
        return { cards: [card], action: 'play', mahJongWish: wish };
      }
    }
    // fallback: play first card (e.g. Mah Jong with a wish) – never return null
    const card = sorted[0];
    const validation = validateCombination([card]);
    if (validation.valid) {
      const wish = isFirstTrick && card.name === 'mahjong' ? '2' : null;
      return { cards: [card], action: 'play', mahJongWish: wish };
    }
    return playLowestSingle(hand) || { cards: [hand[0]], action: 'play', mahJongWish: hand[0].name === 'mahjong' ? '2' : null };
  }

  // Following: try to beat current winning play or pass
  // Safeguard: if we're the lead with empty trick (shouldn't happen), play a card instead of passing
  if (game.leadPlayer === playerId && !game.currentTrick?.length) {
    return playLowestSingle(hand) || { cards: [hand[0]], action: 'play', mahJongWish: hand[0].name === 'mahjong' ? '2' : null };
  }
  const winningPlay = getCurrentWinningPlay(game.currentTrick);
  // Dog-only trick: winningPlay is null; dog priority player must play any combination (cannot pass)
  if (!winningPlay) {
    if (game.currentTrick.length > 0 && game.dogPriorityPlayer === playerId) {
      const anySingle = playLowestSingle(hand);
      if (anySingle) return anySingle;
    }
    return { action: 'pass' };
  }

  const combo = winningPlay.combination;
  if (!combo) return { action: 'pass' };

  // Must play wished card when we have it and it would beat (server only forces when it beats)
  if (game.mahJongWish?.mustPlay && game.mahJongWish.wishedRank && combo.type === 'single') {
    const wishedCard = hand.find((c) => c.type === 'standard' && c.rank === game.mahJongWish.wishedRank);
    if (wishedCard) {
      const v = validateCombination([wishedCard]);
      if (v.valid && compareCombinations(v, combo) === 1) return { cards: [wishedCard], action: 'play', mahJongWish: null };
    }
  }

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
