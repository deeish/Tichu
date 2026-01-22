/**
 * Trick management logic
 * Handles trick winning, starting new tricks, and Dragon opponent selection
 */

const { compareCombinations } = require('./combinations');
const { getCardPoints } = require('./deck');
const { getNextPlayerWithCards, advanceTurn } = require('./turnManagement');

/**
 * Finds the current winning (highest) play in the trick.
 * You must beat the last card played (current highest), not the lead card.
 * @param {Array} currentTrick - Array of { playerId, cards, combination }
 * @returns {Object|null} The play entry with the highest combination, or null if trick is empty
 */
function getCurrentWinningPlay(currentTrick) {
  if (!currentTrick || currentTrick.length === 0) return null;
  
  let winningPlay = currentTrick[0];
  
  for (let i = 1; i < currentTrick.length; i++) {
    const play = currentTrick[i];
    const comparison = compareCombinations(play.combination, winningPlay.combination);
    // If this play beats the current winning play, it becomes the new leader
    if (comparison === 1) {
      winningPlay = play;
    }
  }
  
  return winningPlay;
}

/**
 * Starts a new trick
 * If the lead player has gone out (no cards), lead passes to next player with cards
 */
function startNewTrick(game) {
  game.currentTrick = [];
  game.passedPlayers = [];
  game.dogPriorityPlayer = null; // Clear Dog priority when starting a new trick
  
  // Set current player index to lead player (winner gets priority)
  // The winner of the previous trick becomes the lead player and must play first
  const leadPlayerIndex = game.turnOrder.findIndex(p => p.id === game.leadPlayer);
  if (leadPlayerIndex !== -1) {
    const leadPlayerId = game.turnOrder[leadPlayerIndex].id;
    const leadHasCards = game.hands[leadPlayerId] && game.hands[leadPlayerId].length > 0;
    const leadHasGoneOut = game.playersOut && game.playersOut.includes(leadPlayerId);
    
    if (leadHasCards && !leadHasGoneOut) {
      // Winner has cards - they get priority to play next
      game.currentPlayerIndex = leadPlayerIndex;
    } else {
      // Winner has no cards or has gone out, find NEXT player in turn order with cards
      // This ensures priority goes to player 2, not player 4 (BUGS.md line 24)
      const nextPlayer = getNextPlayerWithCards(game, leadPlayerId);
      if (nextPlayer) {
        game.leadPlayer = nextPlayer.id;
        const nextIndex = game.turnOrder.findIndex(p => p.id === nextPlayer.id);
        if (nextIndex !== -1) {
          game.currentPlayerIndex = nextIndex;
        }
      }
    }
  } else {
    // Lead player not found in turn order - this shouldn't happen, but handle gracefully
    // Try to find any player with cards to continue the game
    for (let i = 0; i < game.turnOrder.length; i++) {
      const player = game.turnOrder[i];
      const hasCards = game.hands[player.id] && game.hands[player.id].length > 0;
      const hasGoneOut = game.playersOut && game.playersOut.includes(player.id);
      if (hasCards && !hasGoneOut) {
        game.leadPlayer = player.id;
        game.currentPlayerIndex = i;
        break;
      }
    }
  }
  
  // Wish persists across tricks until the wished card is played
}

/**
 * Handles when a player wins a trick
 * Cards are added to player's stack (not immediately scored)
 */
function winTrick(game, winnerId) {
  const winner = game.players.find(p => p.id === winnerId);
  
  // Collect all cards from the trick
  const trickCards = [];
  let trickPoints = 0;
  for (const play of game.currentTrick) {
    for (const card of play.cards) {
      trickCards.push(card);
      trickPoints += getCardPoints(card);
    }
  }
  
  // Handle Dragon special rule: winner must give trick to opponent
  // BUT: If someone else beats the Dragon (e.g., with a bomb), they get the stack normally
  let actualWinnerId = winnerId;
  if (game.dragonPlayed && game.dragonPlayed.playerId === winnerId) {
    // Dragon player won the trick - they must choose which opponent to give the trick to
    // Store the trick data and wait for player selection
    game.dragonOpponentSelection = {
      playerId: winnerId,
      trickCards: [...trickCards],
      trickPoints: trickPoints
    };
    // Don't assign the stack yet - wait for player to select opponent
    // Return early to prevent stack assignment
  } else {
    // Normal case: assign stack immediately
    // This includes the case where someone else beat the Dragon (e.g., with a bomb)
    // In that case, winnerId !== game.dragonPlayed.playerId, so Dragon selection doesn't trigger
    actualWinnerId = winnerId;
  }
  
  // Add cards to winner's stack (not immediately scored - scored at round end)
  // Skip if Dragon selection is pending
  if (!game.dragonOpponentSelection) {
    if (!game.playerStacks[actualWinnerId]) {
      game.playerStacks[actualWinnerId] = { cards: [], points: 0 };
    }
    game.playerStacks[actualWinnerId].cards.push(...trickCards);
    game.playerStacks[actualWinnerId].points += trickPoints;
  }
  
  // Store trick (actualWinner will be set when Dragon opponent is selected)
  game.trickHistory.push({
    plays: [...game.currentTrick],
    winner: winnerId,
    actualWinner: game.dragonOpponentSelection ? null : actualWinnerId, // Will be set when Dragon opponent is selected
    points: trickPoints
  });
  
  // Set winner as new lead player (they get priority to play next)
  // This ensures the winner gets priority - they must play a card and cannot pass
  // BUGS.md line 30: if a player wins their hand make sure they get priority
  game.leadPlayer = winnerId;
  
  // Mah Jong wish persists across tricks until the exact wished card is played
  // The wish is only cleared in moveHandler.js when the exact wished card is played
  // No need to clear it here - it will persist until fulfilled
  
  // If Dragon selection is pending, don't clear dragon flag yet
  // Still need to clear current trick, but wait for opponent selection before assigning stack
  if (game.dragonOpponentSelection) {
    // Clear current trick and prepare for next trick, but don't clear dragon flag yet
    game.currentTrick = [];
    game.passedPlayers = [];
    // Don't start new trick fully yet - wait for opponent selection
    // But we can set up the lead player
    return { success: true, game, trickWon: true, winner: winnerId, dragonOpponentSelection: true };
  }
  
  game.dragonPlayed = null; // Clear dragon flag
  
  startNewTrick(game);
  
  return { success: true, game, trickWon: true, winner: winnerId };
}

/**
 * Handles Dragon player selecting which opponent receives the trick
 */
function selectDragonOpponent(game, dragonPlayerId, selectedOpponentId) {
  // Validate that opponent selection is pending
  if (!game.dragonOpponentSelection) {
    return { success: false, error: 'No Dragon opponent selection pending' };
  }
  
  // Validate that the correct player is making the selection
  if (game.dragonOpponentSelection.playerId !== dragonPlayerId) {
    return { success: false, error: 'Only the Dragon player can select the opponent' };
  }
  
  // Validate that selected opponent is actually an opponent (not teammate)
  const dragonPlayer = game.players.find(p => p.id === dragonPlayerId);
  const selectedOpponent = game.players.find(p => p.id === selectedOpponentId);
  
  if (!dragonPlayer || !selectedOpponent) {
    return { success: false, error: 'Invalid player' };
  }
  
  if (dragonPlayer.team === selectedOpponent.team) {
    return { success: false, error: 'Must select an opponent, not a teammate' };
  }
  
  // Assign the trick to the selected opponent
  const { trickCards, trickPoints } = game.dragonOpponentSelection;
  
  if (!game.playerStacks[selectedOpponentId]) {
    game.playerStacks[selectedOpponentId] = { cards: [], points: 0 };
  }
  game.playerStacks[selectedOpponentId].cards.push(...trickCards);
  game.playerStacks[selectedOpponentId].points += trickPoints;
  
  // Update the most recent trick history with the actual winner
  if (game.trickHistory.length > 0) {
    const lastTrick = game.trickHistory[game.trickHistory.length - 1];
    if (lastTrick.actualWinner === null) {
      lastTrick.actualWinner = selectedOpponentId;
    }
  }
  
  // Clear Dragon flags
  game.dragonOpponentSelection = null;
  game.dragonPlayed = null;
  
  // Start new trick (current trick should already be cleared, but ensure turn is set correctly)
  startNewTrick(game);
  
  return { success: true, game };
}

module.exports = {
  getCurrentWinningPlay,
  startNewTrick,
  winTrick,
  selectDragonOpponent
};
