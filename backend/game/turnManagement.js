/**
 * Turn management logic
 * Handles advancing turns and finding next players
 */

/**
 * Advances to the next player's turn.
 * Skips players who have passed or have no cards (gone out).
 */
function advanceTurn(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.turnOrder.length;
  
  const turnOrder = game.turnOrder;
  let attempts = 0;
  const maxAttempts = turnOrder.length; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    const currentId = turnOrder[game.currentPlayerIndex]?.id;
    if (!currentId) break;
    
    const hasPassed = game.passedPlayers.includes(currentId);
    const hasNoCards = !game.hands[currentId] || game.hands[currentId].length === 0;
    const hasGoneOut = game.playersOut?.includes(currentId);
    
    if (!hasPassed && !hasNoCards && !hasGoneOut) break; // Found a player who can act
    
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % turnOrder.length;
    attempts++;
  }
  
  // Fallback: if stuck, find any player who can act (not out, has cards, hasn't passed this trick)
  if (attempts >= maxAttempts) {
    const currentId = turnOrder[game.currentPlayerIndex]?.id;
    const canActCurrent = currentId && !game.passedPlayers.includes(currentId) &&
      !game.playersOut?.includes(currentId) &&
      game.hands[currentId] && game.hands[currentId].length > 0;
    if (!canActCurrent) {
      for (let i = 0; i < turnOrder.length; i++) {
        const playerId = turnOrder[i].id;
        if (!game.passedPlayers.includes(playerId) && !game.playersOut?.includes(playerId) && game.hands[playerId]?.length > 0) {
          game.currentPlayerIndex = i;
          break;
        }
      }
    }
  }
}

/**
 * Gets the next player in turn order who still has cards.
 * Used when lead player has gone out - lead passes to next player with cards.
 */
function getNextPlayerWithCards(game, startPlayerId) {
  const turnOrder = game.turnOrder;
  const startIndex = turnOrder.findIndex(p => p.id === startPlayerId);
  
  if (startIndex === -1) {
    for (let i = 0; i < turnOrder.length; i++) {
      const playerId = turnOrder[i].id;
      if (game.playersOut?.includes(playerId)) continue;
      if (game.hands[playerId]?.length > 0) return turnOrder[i];
    }
    return null;
  }
  
  for (let i = 1; i <= turnOrder.length; i++) {
    const idx = (startIndex + i) % turnOrder.length;
    const playerId = turnOrder[idx].id;
    if (game.playersOut?.includes(playerId)) continue; // BUGS.md: finished players are out until next round
    if (game.hands[playerId]?.length > 0) return turnOrder[idx];
  }
  return null;
}

module.exports = {
  advanceTurn,
  getNextPlayerWithCards
};
