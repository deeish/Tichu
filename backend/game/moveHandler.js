/**
 * Move handling logic
 * Handles player moves, card validation, and game flow
 */

const { validateCombination, compareCombinations, getPhoenixValue } = require('./combinations');
const { getCurrentWinningPlay, winTrick } = require('./trickManager');
const { handleSpecialCards } = require('./specialCards');
const { advanceTurn } = require('./turnManagement');
const { handlePlayerWin } = require('./scoring');

/**
 * Handles a player's move
 * @param {Object} game - Game state
 * @param {string} playerId - Player making the move
 * @param {Array} cards - Cards to play
 * @param {string} action - 'play' or 'pass'
 * @param {string} mahJongWish - Optional: rank wished when playing Mah Jong as single
 */
function makeMove(game, playerId, cards, action = 'play', mahJongWish = null) {
  if (game.state !== 'playing') {
    return { success: false, error: 'Game is not in playing state' };
  }
  
  // Handle pass action (cannot be a bomb)
  if (action === 'pass') {
    // Check turn order for pass
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }
    
    // Lead player cannot pass - they must play a card (they have priority from winning the previous trick)
    // This applies both when starting a new trick (currentTrick.length === 0) and during a trick
    // BUGS.md line 27: when a player gets priority they are never allowed to pass
    if (game.leadPlayer === playerId) {
      return { success: false, error: 'You are the lead player and must play a card (cannot pass)' };
    }
    
    // Player with Dog priority cannot pass - they must play a card
    // BUGS.md line 27: when a player gets priority they are never allowed to pass
    if (game.dogPriorityPlayer === playerId) {
      return { success: false, error: 'You have priority from Dog and must play a card (cannot pass)' };
    }
    
    // Additional check: If current trick is empty and player is the lead, they cannot pass
    // This handles edge case where lead player might try to pass at start of new trick
    if (game.currentTrick.length === 0 && game.leadPlayer === playerId) {
      return { success: false, error: 'You are the lead player and must play a card to start the trick (cannot pass)' };
    }
    
    // Check if there's an active wish that must be fulfilled
    if (game.mahJongWish && game.mahJongWish.mustPlay) {
      const hand = game.hands[playerId];
      const hasWishedCard = hand.some(card => 
        card.type === 'standard' && card.rank === game.mahJongWish.wishedRank
      );
      
      if (hasWishedCard) {
        return { success: false, error: `You must play ${game.mahJongWish.wishedRank} as a single card (cannot pass)` };
      }
    }
    
    // If there's a wish but player doesn't have the card, they can pass
    // The wish stays active for the next player
    game.passedPlayers.push(playerId);
    
    // Get the lead player (first player to play in this trick)
    const leadPlayerId = game.currentTrick[0]?.playerId;
    if (!leadPlayerId) {
      return { success: false, error: 'No lead player found' };
    }
    
    // Find the lead player's index in turn order
    const leadPlayerIndex = game.turnOrder.findIndex(p => p.id === leadPlayerId);
    if (leadPlayerIndex === -1) {
      return { success: false, error: 'Lead player not found in turn order' };
    }
    
    // Get all players who should have a turn (everyone except the lead player and those who have gone out)
    const playersWhoShouldHaveTurn = game.players
      .filter(p => p.id !== leadPlayerId && 
        !game.playersOut?.includes(p.id) && 
        game.hands[p.id] && 
        game.hands[p.id].length > 0)
      .map(p => p.id);
    
    // Check if all players who should have a turn have either passed or played
    const allPlayersHaveActed = playersWhoShouldHaveTurn.length > 0 && 
      playersWhoShouldHaveTurn.every(playerId => 
        game.passedPlayers.includes(playerId) || 
        game.currentTrick.some(play => play.playerId === playerId)
      );
    
    // Advance to next player FIRST, then check if we've completed the cycle
    // This ensures all players get a turn before ending the trick
    const currentIndexBeforeAdvance = game.currentPlayerIndex;
    advanceTurn(game);
    const currentIndexAfterAdvance = game.currentPlayerIndex;
    const nextPlayer = game.turnOrder[game.currentPlayerIndex];
    const nextPlayerId = nextPlayer?.id;
    
    // Improved cycle detection: Check if we've gone through ALL players after the lead
    // Count how many players after the lead have acted
    let cycledBackToLead = false;
    if (leadPlayerIndex !== -1 && playersWhoShouldHaveTurn.length > 0) {
      // Get all players after the lead in turn order (excluding lead and those who went out)
      const playersAfterLead = [];
      for (let i = 1; i < game.turnOrder.length; i++) {
        const idx = (leadPlayerIndex + i) % game.turnOrder.length;
        const player = game.turnOrder[idx];
        if (player && playersWhoShouldHaveTurn.includes(player.id)) {
          playersAfterLead.push(player.id);
        }
      }
      
      // Check if all players after lead have acted
      const allAfterLeadActed = playersAfterLead.length > 0 && 
        playersAfterLead.every(id => 
          game.passedPlayers.includes(id) || 
          game.currentTrick.some(play => play.playerId === id)
        );
      
      // Also check if we've wrapped around to or past the lead player
      const wasAfterLead = currentIndexBeforeAdvance > leadPlayerIndex;
      const isAtOrBeforeLead = currentIndexAfterAdvance <= leadPlayerIndex;
      const wrappedAround = wasAfterLead && isAtOrBeforeLead;
      
      cycledBackToLead = allAfterLeadActed || (wrappedAround && nextPlayerId === leadPlayerId);
    }
    
    // End trick if: all remaining players have acted OR we've cycled back to lead
    if (game.currentTrick.length > 0 && (allPlayersHaveActed || cycledBackToLead)) {
      const winningPlay = getCurrentWinningPlay(game.currentTrick);
      if (winningPlay) {
        const result = winTrick(game, winningPlay.playerId);
        return { ...result, newTrick: true };
      }
      // Fallback: if no winning play found, use the lead player
      const result = winTrick(game, leadPlayerId);
      return { ...result, newTrick: true };
    }
    
    // Not all players have acted yet, continue with next player's turn
    return { success: true, game };
  }
  
  // Validate combination first (to check if it's a bomb)
  const validation = validateCombination(cards);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid combination' };
  }
  
  // Check if cards are in player's hand
  const hand = game.hands[playerId];
  for (const card of cards) {
    const cardIndex = hand.findIndex(c => 
      c.type === card.type && 
      (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
    );
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand' };
    }
  }
  
  // BOMB INTERRUPT LOGIC: Bombs can be played at any time, except when Dog is in the current trick
  const isBomb = validation.type === 'bomb';
  if (isBomb) {
    // Check if Dog is in the current trick
    const dogInTrick = game.currentTrick.some(trickEntry => 
      trickEntry.cards.some(c => c.name === 'dog')
    );
    
    if (dogInTrick) {
      return { success: false, error: 'Bombs cannot be played when Dog is in the current trick' };
    }
    
    // If there's already a bomb in the trick, the new bomb must beat it
    // Only bombs can beat bombs - compare against current HIGHEST play, not the lead
    if (game.currentTrick.length > 0) {
      const winningPlay = getCurrentWinningPlay(game.currentTrick);
      if (winningPlay && winningPlay.combination.type === 'bomb') {
        const currentBomb = winningPlay.combination;
        const comparison = compareCombinations(validation, currentBomb);
        
        if (comparison === null || comparison <= 0) {
          // Provide specific error message based on current bomb type
          if (currentBomb.bombType === 'four-of-a-kind') {
            return { success: false, error: 'Must play a higher four-of-a-kind or a straight flush to beat the current bomb' };
          } else if (currentBomb.bombType === 'straight-flush') {
            return { success: false, error: 'Must play a higher straight flush (longer or same length with higher value) to beat the current bomb' };
          } else {
            return { success: false, error: 'Must play a higher bomb to beat the current bomb' };
          }
        }
      }
      // If current highest isn't a bomb, any bomb can beat it (bomb beats everything)
    }
    
    // Remove cards from hand first
    for (const card of cards) {
      const cardIndex = hand.findIndex(c => 
        c.type === card.type && 
        (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
      );
      if (cardIndex !== -1) {
        hand.splice(cardIndex, 1);
      }
    }
    
    // Bomb can be played out of turn - add to current trick (interrupts it)
    // After a bomb is played, other players still have a chance to play a higher bomb
    game.currentTrick.push({
      playerId,
      cards,
      combination: validation
    });
    
    // Clear passed players (bomb interrupts)
    game.passedPlayers = [];
    
    // Set bomb player as new lead (for next trick, if this bomb wins)
    game.leadPlayer = playerId;
    
    // Update turn order to start from bomb player
    // This ensures that if the bomb wins, the bomb player gets priority for the next trick
    const bombPlayerIndex = game.turnOrder.findIndex(p => p.id === playerId);
    if (bombPlayerIndex !== -1) {
      game.turnOrder = [
        ...game.turnOrder.slice(bombPlayerIndex),
        ...game.turnOrder.slice(0, bombPlayerIndex)
      ];
      // Update currentPlayerIndex to reflect the new turn order
      // Bomb player is now at index 0, so we'll advance to index 1 next
      game.currentPlayerIndex = 0;
    }
    
    // Mark that player has played their first card (can no longer declare Tichu)
    if (!game.firstCardPlayed[playerId]) {
      game.firstCardPlayed[playerId] = true;
    }
    
    // Check if player went out (empty hand)
    if (hand.length === 0) {
      // Player went out but trick continues (others can still play higher bomb)
      const winResult = handlePlayerWin(game, playerId);
      if (!game.roundEnded) {
        // Advance to next player to give others a chance to play a higher bomb
        // Bomb player is now at index 0, set to 0 and advanceTurn will skip to next valid player
        game.currentPlayerIndex = 0;
        advanceTurn(game); // This will skip the bomb player (who went out) and find next valid player
        return { ...winResult, success: true, game, bombPlayed: true, playerWon: true };
      }
      return { ...winResult, bombPlayed: true, playerWon: true };
    }
    
    // Advance to next player to give others a chance to play a higher bomb
    // Bomb player is now at index 0, set to 0 and advanceTurn will move to next player (index 1)
    game.currentPlayerIndex = 0;
    advanceTurn(game); // This will move to index 1 (next player after bomb player)
    
    return { success: true, game, bombPlayed: true };
  }
  
  // Normal turn validation (not a bomb)
  const currentPlayer = game.turnOrder[game.currentPlayerIndex];
  if (currentPlayer.id !== playerId) {
    return { success: false, error: 'Not your turn' };
  }
  
  // Check if Mah Jong holder must play Mah Jong first
  if (!game.mahJongPlayed && game.leadPlayer === playerId && game.currentTrick.length === 0) {
    const hasMahJong = hand.some(card => card.name === 'mahjong');
    if (hasMahJong) {
      const mahJongInPlay = cards.some(card => card.name === 'mahjong');
      if (!mahJongInPlay) {
        return { success: false, error: 'You must play Mah Jong first' };
      }
    }
  }
  
  // If there's a current trick, validate the move beats the CURRENT HIGHEST play
  // (not the lead card - you must beat the last card played / current leader)
  // EXCEPTION: If Dog is the only card in the trick and player has Dog priority,
  // they can play any combination (Dog passes a "winning hand" - no need to beat it)
  const dogInTrick = game.currentTrick.length === 1 && 
    game.currentTrick[0].cards.some(c => c.name === 'dog');
  const hasDogPriority = game.dogPriorityPlayer === playerId;
  
  if (game.currentTrick.length > 0 && !(dogInTrick && hasDogPriority)) {
    const winningPlay = getCurrentWinningPlay(game.currentTrick);
    const currentWinningCombo = winningPlay ? winningPlay.combination : null;
    
    if (!currentWinningCombo) {
      return { success: false, error: 'Invalid trick state' };
    }
    
    // Only bombs can beat bombs
    if (currentWinningCombo.type === 'bomb' && validation.type !== 'bomb') {
      return { success: false, error: 'Only a bomb can beat a bomb. You must play a bomb or pass' };
    }
    
    const comparison = compareCombinations(validation, currentWinningCombo);
    
    if (comparison === null || comparison <= 0) {
      return { success: false, error: 'Must play a higher combination or pass' };
    }
  } else if (game.currentTrick.length === 0) {
    // Starting a new trick - check if wish must be fulfilled
    if (game.mahJongWish && game.mahJongWish.mustPlay) {
      const hand = game.hands[playerId];
      const hasWishedCard = hand.some(card => 
        card.type === 'standard' && card.rank === game.mahJongWish.wishedRank
      );
      
      if (hasWishedCard) {
        // Must play the wished card as a single to start the trick
        if (validation.type !== 'single' || cards[0].type !== 'standard' || 
            cards[0].rank !== game.mahJongWish.wishedRank) {
          return { success: false, error: `You must play ${game.mahJongWish.wishedRank} as a single card to start this trick` };
        }
      } else {
        // Don't have the wished card, can play any single to start the trick
        if (validation.type !== 'single') {
          return { success: false, error: 'Must play a single card to start this trick (wish is active)' };
        }
      }
    } else if (!game.mahJongWish) {
      // No active wish - can play any valid combination to start trick
      // (This is the normal case)
    }
  }
  
  // Handle Mah Jong wish
  const mahJongInCards = cards.find(c => c.name === 'mahjong');
  if (mahJongInCards && validation.type === 'single' && game.currentTrick.length === 0) {
    // Mah Jong played as single - requires a wish
    if (!mahJongWish) {
      return { success: false, error: 'Must specify a wish when playing Mah Jong as a single' };
    }
    
    // Validate wish is for a standard card (not special)
    const validRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    if (!validRanks.includes(mahJongWish)) {
      return { success: false, error: 'Wish must be for a standard card rank (2-A), not a special card' };
    }
    
    // Set the wish (stays active until the wished card is played)
    game.mahJongWish = {
      wishedRank: mahJongWish,
      mustPlay: true // Wish stays active until card is played
    };
    
    game.mahJongPlayed = true;
  } else if (mahJongInCards && validation.type === 'straight') {
    // Mah Jong in straight - no wish needed
    game.mahJongPlayed = true;
    game.mahJongWish = null;
  }
  
  // Handle Phoenix single card value (must be done before adding to trick)
  if (validation.type === 'single' && cards[0].name === 'phoenix') {
    const phoenixValue = getPhoenixValue(cards[0], game.currentTrick);
    // Store Phoenix value in the card for comparison
    cards[0].phoenixValue = phoenixValue;
    // Also update in validation for comparison
    validation.phoenixValue = phoenixValue;
  }
  
  // Handle special cards
  const specialCardResult = handleSpecialCards(game, playerId, cards, validation);
  if (specialCardResult.error) {
    return { success: false, error: specialCardResult.error };
  }
  
  // Track if Dog was played (so we don't advance turn - partner already has priority)
  const dogWasPlayed = specialCardResult.dogPlayed || false;
  
  // Remove cards from hand
  for (const card of cards) {
    const cardIndex = hand.findIndex(c => 
      c.type === card.type && 
      (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
    );
    if (cardIndex !== -1) {
      hand.splice(cardIndex, 1);
    }
  }
  
  // Mark that player has played their first card (can no longer declare Tichu)
  if (!game.firstCardPlayed[playerId]) {
    game.firstCardPlayed[playerId] = true;
  }
  
  // Add to current trick
  game.currentTrick.push({
    playerId,
    cards,
    combination: validation
  });
  
  // Handle wish fulfillment - wish is cleared ONLY when the exact wished card is played as a single
  // According to Tichu rules, the wish persists across tricks until the exact wished card is played
  // Mah Jong as a single has NO value - its only role is to make a wish that persists
  if (game.mahJongWish && game.mahJongWish.mustPlay) {
    // Check if the exact wished card is played as a single
    if (validation.type === 'single' && cards[0].type === 'standard' && 
        cards[0].rank === game.mahJongWish.wishedRank) {
      // Exact wished card played, clear wish
      game.mahJongWish = null;
    }
    // Otherwise, wish persists - it will be enforced on the next player's turn
  }
  
  // Check if player went out (empty hand) - handle this first
  if (hand.length === 0) {
    // Check if all others passed before going out
    if (game.passedPlayers.length === game.players.length - 1) {
      // Win the trick first, then handle going out
      const trickResult = winTrick(game, playerId);
      const winResult = handlePlayerWin(game, playerId);
      return { ...trickResult, ...winResult, playerWon: true };
    }
    // Player went out but trick continues
    const winResult = handlePlayerWin(game, playerId);
    if (!game.roundEnded) {
      advanceTurn(game);
      return { ...winResult, success: true, game, playerWon: true };
    }
    return winResult;
  }
  
  // BUGS.md line 1: When a card is played and all others pass, lead player wins trick and plays again
  // Check if all other players have passed (this happens when a new play resets passes)
  // After adding the card to trick, check if all other players have passed
  const playersWhoShouldHaveTurn = game.players
    .filter(p => p.id !== playerId && 
      !game.playersOut?.includes(p.id) && 
      game.hands[p.id] && 
      game.hands[p.id].length > 0)
    .map(p => p.id);
  
  // If all other players have passed, the lead player wins the trick immediately
  // This handles the case where player 1 plays, then players 2, 3, 4 all pass
  if (playersWhoShouldHaveTurn.length > 0 && 
      playersWhoShouldHaveTurn.every(id => game.passedPlayers.includes(id))) {
    // All other players have passed - lead player wins trick and plays again
    const trickResult = winTrick(game, playerId);
    return { ...trickResult, success: true, game, trickWon: true, winner: playerId, leadPlaysAgain: true };
  }
  
  // Clear passed players (new play resets passes)
  game.passedPlayers = [];
  
  // Clear Dog priority when the player with priority plays a card
  if (game.dogPriorityPlayer === playerId) {
    game.dogPriorityPlayer = null;
  }
  
  // Move to next player (skips those who have gone out)
  // Note: If Dog was played, don't advance turn - handleSpecialCards already set currentPlayerIndex to the partner
  // Note: If all others pass, the check happens in the pass handler, not here
  if (!dogWasPlayed) {
    advanceTurn(game);
  }
  
  // Wish stays active until the wished card is played
  // No need to check here - the wish will be enforced on the next player's turn
  // and cleared when the wished card is actually played
  
  return { success: true, game };
}

module.exports = {
  makeMove
};
