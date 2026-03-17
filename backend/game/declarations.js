/**
 * Tichu and Grand Tichu declaration logic
 * Handles player declarations and card revelation
 */

function cardMatch(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'standard') return a.suit === b.suit && a.rank === b.rank;
  return a.name === b.name;
}

/**
 * Handles Grand Tichu declaration
 * Rule: Players cannot call both Tichu and Grand Tichu (one or the other).
 */
function declareGrandTichu(game, playerId) {
  if (game.state !== 'grand-tichu') {
    return { success: false, error: 'Not the right phase for Grand Tichu' };
  }

  if (game.tichuDeclarations && game.tichuDeclarations[playerId]) {
    return { success: false, error: 'You cannot call both Tichu and Grand Tichu (one or the other)' };
  }

  // Can only declare if cards haven't been revealed yet
  if (game.cardsRevealed[playerId]) {
    return { success: false, error: 'Cannot declare Grand Tichu after revealing cards' };
  }

  game.grandTichuDeclarations[playerId] = true;
  // Reveal remaining cards when declaring Grand Tichu
  game.cardsRevealed[playerId] = true;
  game.hands[playerId] = [...game.hands[playerId], ...game.remainingCards[playerId]];
  
  return { success: true, game };
}

/**
 * Reveals the remaining 6 cards for a player
 */
function revealRemainingCards(game, playerId) {
  if (game.state !== 'grand-tichu') {
    return { success: false, error: 'Not the right phase to reveal cards' };
  }
  
  if (game.cardsRevealed[playerId]) {
    return { success: false, error: 'Cards already revealed' };
  }
  
  // Reveal remaining cards
  game.cardsRevealed[playerId] = true;
  game.hands[playerId] = [...game.hands[playerId], ...game.remainingCards[playerId]];
  
  return { success: true, game };
}

/**
 * Handles Tichu declaration
 * Can only be called during playing phase, when playing first card.
 * Rule: Players cannot call both Tichu and Grand Tichu (one or the other).
 */
function declareTichu(game, playerId) {
  if (game.state !== 'playing') {
    return { success: false, error: 'Tichu can only be declared during play' };
  }

  if (game.grandTichuDeclarations && game.grandTichuDeclarations[playerId]) {
    return { success: false, error: 'You cannot call both Tichu and Grand Tichu (one or the other)' };
  }

  // Check if player has already played their first card
  if (game.firstCardPlayed[playerId]) {
    return { success: false, error: 'Tichu can only be declared when playing your first card' };
  }

  // Check if it's player's turn (defensive: turnOrder/currentPlayerIndex may be missing in edge cases)
  const turnOrder = game.turnOrder;
  const idx = game.currentPlayerIndex;
  if (!Array.isArray(turnOrder) || turnOrder.length === 0 || typeof idx !== 'number' || idx < 0 || idx >= turnOrder.length) {
    return { success: false, error: 'Invalid turn state' };
  }
  const currentPlayer = turnOrder[idx];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { success: false, error: 'Can only declare Tichu on your turn' };
  }

  game.tichuDeclarations = game.tichuDeclarations || {};
  game.tichuDeclarations[playerId] = true;
  return { success: true, game };
}

/**
 * Undo Tichu declaration (only before first card is played).
 */
function undeclareTichu(game, playerId) {
  if (game.state !== 'playing') {
    return { success: false, error: 'Not the right phase to undeclare Tichu' };
  }
  if (!game.tichuDeclarations || !game.tichuDeclarations[playerId]) {
    return { success: false, error: 'You have not declared Tichu' };
  }
  if (game.firstCardPlayed[playerId]) {
    return { success: false, error: 'Cannot undeclare Tichu after playing a card' };
  }
  const turnOrder = game.turnOrder;
  const idx = game.currentPlayerIndex;
  if (!Array.isArray(turnOrder) || turnOrder.length === 0 || typeof idx !== 'number' || idx < 0 || idx >= turnOrder.length) {
    return { success: false, error: 'Invalid turn state' };
  }
  const currentPlayer = turnOrder[idx];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { success: false, error: 'Can only undeclare Tichu on your turn' };
  }
  delete game.tichuDeclarations[playerId];
  return { success: true, game };
}

/**
 * Undo Grand Tichu declaration (only in grand-tichu phase, before leaving).
 * Puts the 6 remaining cards back to unrevealed.
 */
function undeclareGrandTichu(game, playerId) {
  if (game.state !== 'grand-tichu') {
    return { success: false, error: 'Not the right phase to undeclare Grand Tichu' };
  }
  if (!game.grandTichuDeclarations || !game.grandTichuDeclarations[playerId]) {
    return { success: false, error: 'You have not declared Grand Tichu' };
  }
  if (!game.cardsRevealed[playerId] || !game.remainingCards[playerId]) {
    return { success: false, error: 'Cannot undeclare Grand Tichu' };
  }
  const remaining = game.remainingCards[playerId];
  let hand = game.hands[playerId] || [];
  for (const toRemove of remaining) {
    const idx = hand.findIndex((c) => cardMatch(c, toRemove));
    if (idx >= 0) hand = hand.slice(0, idx).concat(hand.slice(idx + 1));
  }
  game.hands[playerId] = hand;
  game.cardsRevealed[playerId] = false;
  delete game.grandTichuDeclarations[playerId];
  return { success: true, game };
}

module.exports = {
  declareGrandTichu,
  revealRemainingCards,
  declareTichu,
  undeclareTichu,
  undeclareGrandTichu
};
