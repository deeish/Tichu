/**
 * Tichu and Grand Tichu declaration logic
 * Handles player declarations and card revelation
 */

/**
 * Handles Grand Tichu declaration
 */
function declareGrandTichu(game, playerId) {
  if (game.state !== 'grand-tichu') {
    return { success: false, error: 'Not the right phase for Grand Tichu' };
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
 * Can only be called during playing phase, when playing first card
 */
function declareTichu(game, playerId) {
  if (game.state !== 'playing') {
    return { success: false, error: 'Tichu can only be declared during play' };
  }
  
  // Check if player has already played their first card
  if (game.firstCardPlayed[playerId]) {
    return { success: false, error: 'Tichu can only be declared when playing your first card' };
  }
  
  // Check if it's player's turn
  const currentPlayer = game.turnOrder[game.currentPlayerIndex];
  if (currentPlayer.id !== playerId) {
    return { success: false, error: 'Can only declare Tichu on your turn' };
  }
  
  game.tichuDeclarations[playerId] = true;
  return { success: true, game };
}

module.exports = {
  declareGrandTichu,
  revealRemainingCards,
  declareTichu
};
