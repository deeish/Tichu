/**
 * Turn management logic
 * Handles advancing turns and finding next players
 */

/**
 * Advances to the next player's turn
 * Skips players who have passed AND players who have gone out (no cards left)
 */
function advanceTurn(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.turnOrder.length;
  
  const turnOrder = game.turnOrder;
  let attempts = 0;
  const maxAttempts = turnOrder.length; // Prevent infinite loop
  
  while (attempts < maxAttempts) {
    const currentId = turnOrder[game.currentPlayerIndex]?.id;
    if (!currentId) {
      // Safety check: if currentId is undefined, break to prevent errors
      break;
    }
    
    const hasPassed = game.passedPlayers.includes(currentId);
    const hasGoneOut = game.playersOut && game.playersOut.includes(currentId);
    const hasNoCards = !game.hands[currentId] || game.hands[currentId].length === 0;
    
    if (!hasPassed && !hasGoneOut && !hasNoCards) {
      break; // Found a player who can act
    }
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % turnOrder.length;
    attempts++;
  }
  
  // Safety check: if we've exhausted all attempts and still can't find a valid player,
  // it means all remaining players have passed or gone out
  // This should be handled by the pass detection logic, but this prevents infinite loops
  if (attempts >= maxAttempts) {
    const currentId = turnOrder[game.currentPlayerIndex]?.id;
    const hasPassed = currentId && game.passedPlayers.includes(currentId);
    const hasGoneOut = currentId && game.playersOut && game.playersOut.includes(currentId);
    const hasNoCards = !currentId || !game.hands[currentId] || game.hands[currentId].length === 0;
    
    // If we're stuck on a player who can't act, try to find any valid player
    if (hasPassed || hasGoneOut || hasNoCards) {
      for (let i = 0; i < turnOrder.length; i++) {
        const playerId = turnOrder[i].id;
        const canAct = !game.passedPlayers.includes(playerId) &&
          (!game.playersOut || !game.playersOut.includes(playerId)) &&
          game.hands[playerId] && game.hands[playerId].length > 0;
        if (canAct) {
          game.currentPlayerIndex = i;
          break;
        }
      }
    }
  }
}

/**
 * Gets the next player in turn order who still has cards (not in playersOut)
 * Used when lead player has gone out - lead passes to next player with cards
 */
function getNextPlayerWithCards(game, startPlayerId) {
  const turnOrder = game.turnOrder;
  const startIndex = turnOrder.findIndex(p => p.id === startPlayerId);
  
  if (startIndex === -1) {
    // Start player not found in turn order, find first player with cards
    for (let i = 0; i < turnOrder.length; i++) {
      const playerId = turnOrder[i].id;
      const hasGoneOut = game.playersOut && game.playersOut.includes(playerId);
      const hasNoCards = !game.hands[playerId] || game.hands[playerId].length === 0;
      
      if (!hasGoneOut && !hasNoCards) {
        return turnOrder[i];
      }
    }
    return null;
  }
  
  // Start from the next player in turn order (i = 1 means next player)
  for (let i = 1; i <= turnOrder.length; i++) {
    const idx = (startIndex + i) % turnOrder.length;
    const playerId = turnOrder[idx].id;
    const hasGoneOut = game.playersOut && game.playersOut.includes(playerId);
    const hasNoCards = !game.hands[playerId] || game.hands[playerId].length === 0;
    
    if (!hasGoneOut && !hasNoCards) {
      return turnOrder[idx];
    }
  }
  return null; // All players have gone out
}

module.exports = {
  advanceTurn,
  getNextPlayerWithCards
};
