/**
 * Special card handling logic
 * Handles Dog, Dragon, Phoenix, and Mah Jong special rules
 */

const { getNextPlayerWithCards } = require('./turnManagement');

/**
 * Handles special card logic
 */
function handleSpecialCards(game, playerId, cards, combination) {
  // Check for Dog
  const dog = cards.find(c => c.name === 'dog');
  if (dog) {
    if (game.currentTrick.length > 0) {
      return { error: 'Dog can only be played as the lead card' };
    }
    // Dog passes lead to partner (or next player if partner has gone out)
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      return { error: 'Player not found' };
    }
    
    const partner = game.players.find(p => p.team === player.team && p.id !== playerId);
    
    let nextLeadPlayer = null;
    
    if (partner) {
      // Check if partner has cards and hasn't gone out
      const partnerHasCards = game.hands[partner.id] && game.hands[partner.id].length > 0;
      const partnerHasGoneOut = game.playersOut && game.playersOut.includes(partner.id);
      
      if (partnerHasCards && !partnerHasGoneOut) {
        // Partner has cards - they get priority
        nextLeadPlayer = partner;
      } else {
        // Partner has gone out or has no cards - find next player with cards (even if not teammate)
        nextLeadPlayer = getNextPlayerWithCards(game, partner.id);
      }
    } else {
      // No partner found (shouldn't happen in 4-player game, but handle it)
      // Find next player with cards starting from the Dog player
      nextLeadPlayer = getNextPlayerWithCards(game, playerId);
    }
    
    // If we found a next lead player, set them as lead and give them priority
    if (nextLeadPlayer) {
      game.leadPlayer = nextLeadPlayer.id;
      game.dogPriorityPlayer = nextLeadPlayer.id; // Track that this player has priority and cannot pass
      const nextIndex = game.turnOrder.findIndex(p => p.id === nextLeadPlayer.id);
      if (nextIndex !== -1) {
        game.currentPlayerIndex = nextIndex;
      } else {
        // If player not found in turn order, this is an error
        return { error: 'Next lead player not found in turn order' };
      }
    } else {
      // No valid player found - this shouldn't happen, but handle gracefully
      return { error: 'No valid player found to receive Dog priority' };
    }
    // Note: Player who gets priority from Dog can play any valid combination (no restriction to singles)
    return { success: true, dogPlayed: true }; // Signal that Dog was played
  }
  
  // Check for Dragon
  const dragon = cards.find(c => c.name === 'dragon');
  if (dragon && combination.type === 'single') {
    // Dragon will need special handling when trick is won
    game.dragonPlayed = { playerId, trickIndex: game.trickHistory.length };
  }
  
  return { success: true };
}

module.exports = {
  handleSpecialCards
};
