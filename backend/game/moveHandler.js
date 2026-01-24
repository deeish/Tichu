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
    
    // CRITICAL FIX: When passing, we need to advance to the NEXT player in turn order
    // who hasn't acted yet, NOT skip players who have passed (they already got their turn)
    // The issue: advanceTurn() skips players who have passed, but we need to give
    // ALL players a turn, even if they've already passed
    
    // Advance to next player in turn order (don't skip passed players - they already acted)
    // We need to find the next player who hasn't acted yet
    const currentIndexBeforeAdvance = game.currentPlayerIndex;
    
    // Find next player who hasn't acted (not in passedPlayers and not in currentTrick)
    let nextPlayerIndex = (game.currentPlayerIndex + 1) % game.turnOrder.length;
    let attempts = 0;
    while (attempts < game.turnOrder.length) {
      const nextPlayerId = game.turnOrder[nextPlayerIndex]?.id;
      if (!nextPlayerId) break;
      
      // Skip if player has gone out or has no cards
      const hasGoneOut = game.playersOut?.includes(nextPlayerId);
      const hasNoCards = !game.hands[nextPlayerId] || game.hands[nextPlayerId].length === 0;
      
      // Check if this player has already acted (passed or played)
      const hasActed = game.passedPlayers.includes(nextPlayerId) || 
                      game.currentTrick.some(play => play.playerId === nextPlayerId);
      
      // If player hasn't acted and can act, this is our next player
      if (!hasGoneOut && !hasNoCards && !hasActed) {
        break;
      }
      
      // If we've wrapped back to lead player, stop
      if (nextPlayerIndex === leadPlayerIndex) {
        break;
      }
      
      nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
      attempts++;
    }
    
    game.currentPlayerIndex = nextPlayerIndex;
    const currentIndexAfterAdvance = game.currentPlayerIndex;
    const nextPlayer = game.turnOrder[game.currentPlayerIndex];
    const nextPlayerId = nextPlayer?.id;
    
    // CRITICAL FIX: Ensure we've actually given ALL players after the lead a turn
    // The issue is that we might wrap around before all players have gotten a turn
    // We need to check if we've cycled through ALL players in turn order after the lead
    
    let cycledBackToLead = false;
    if (leadPlayerIndex !== -1 && playersWhoShouldHaveTurn.length > 0) {
      // Get all players after the lead in turn order (in the correct order)
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
      
      // CRITICAL: Only end trick if we've wrapped around AND all players have acted
      // We must ensure we've actually given every player a turn, not just that they've acted
      // Check if we've wrapped around to or past the lead player
      const wasAfterLead = currentIndexBeforeAdvance > leadPlayerIndex || 
                          (currentIndexBeforeAdvance < leadPlayerIndex && currentIndexBeforeAdvance === 0);
      const isAtOrBeforeLead = currentIndexAfterAdvance <= leadPlayerIndex;
      const wrappedAround = wasAfterLead && isAtOrBeforeLead;
      
      // Only consider it cycled if ALL players after lead have acted AND we've wrapped around
      // OR if the next player is the lead (meaning we've gone through everyone)
      cycledBackToLead = allAfterLeadActed && (wrappedAround || nextPlayerId === leadPlayerId);
    }
    
    // End trick ONLY if: all remaining players have acted AND we've cycled back to lead
    // This ensures every player gets a turn before the trick ends
    if (game.currentTrick.length > 0 && allPlayersHaveActed && cycledBackToLead) {
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
      // Use the same logic as normal play to find next player who hasn't acted
      const leadPlayerId = game.currentTrick[0]?.playerId;
      const leadPlayerIndex = leadPlayerId ? game.turnOrder.findIndex(p => p.id === leadPlayerId) : -1;
      
      // Clear passed players
      game.passedPlayers = [];
      
      // Find next player who hasn't acted yet
      // Bomb player is now at index 0, so start from index 1
      let nextPlayerIndex = 1 % game.turnOrder.length;
      let attempts = 0;
      const maxAttempts = game.turnOrder.length;
      
      while (attempts < maxAttempts) {
        const nextPlayerId = game.turnOrder[nextPlayerIndex]?.id;
        if (!nextPlayerId) {
          nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
          attempts++;
          continue;
        }
        
        const hasGoneOut = game.playersOut?.includes(nextPlayerId);
        const hasNoCards = !game.hands[nextPlayerId] || game.hands[nextPlayerId].length === 0;
        const hasPlayed = game.currentTrick.some(play => play.playerId === nextPlayerId);
        
        if (!hasGoneOut && !hasNoCards && !hasPlayed) {
          break;
        }
        
        if (leadPlayerIndex !== -1 && nextPlayerIndex === leadPlayerIndex) {
          break;
        }
        
        nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
        attempts++;
      }
      
      game.currentPlayerIndex = nextPlayerIndex;
      return { ...winResult, success: true, game, bombPlayed: true, playerWon: true };
    }
    return { ...winResult, bombPlayed: true, playerWon: true };
    }
    
    // Advance to next player to give others a chance to play a higher bomb
    // Use the same logic as normal play to find next player who hasn't acted
    const leadPlayerId = game.currentTrick[0]?.playerId;
    const leadPlayerIndex = leadPlayerId ? game.turnOrder.findIndex(p => p.id === leadPlayerId) : -1;
    
    // Clear passed players (bomb interrupts)
    game.passedPlayers = [];
    
    // Find next player who hasn't acted yet
    // Bomb player is now at index 0, so start from index 1
    let nextPlayerIndex = 1 % game.turnOrder.length; // Start from index 1 (next after bomb player)
    let attempts = 0;
    const maxAttempts = game.turnOrder.length;
    
    while (attempts < maxAttempts) {
      const nextPlayerId = game.turnOrder[nextPlayerIndex]?.id;
      if (!nextPlayerId) {
        nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
        attempts++;
        continue;
      }
      
      const hasGoneOut = game.playersOut?.includes(nextPlayerId);
      const hasNoCards = !game.hands[nextPlayerId] || game.hands[nextPlayerId].length === 0;
      const hasPlayed = game.currentTrick.some(play => play.playerId === nextPlayerId);
      
      if (!hasGoneOut && !hasNoCards && !hasPlayed) {
        break;
      }
      
      if (leadPlayerIndex !== -1 && nextPlayerIndex === leadPlayerIndex) {
        break;
      }
      
      nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
      attempts++;
    }
    
    game.currentPlayerIndex = nextPlayerIndex;
    
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
  
  // DEBUG: Log the current state
  // console.log('After adding to trick:', {
  //   playerId,
  //   currentPlayerIndex: game.currentPlayerIndex,
  //   currentTrick: game.currentTrick.map(p => p.playerId),
  //   passedPlayers: game.passedPlayers
  // });
  
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
  // CRITICAL: If Dog was played, don't handle going out here - Dog already set the turn
  // The partner should get priority, not the next player in normal turn order
  if (hand.length === 0 && !dogWasPlayed) {
    // Check if all others passed before going out
    if (game.passedPlayers.length === game.players.length - 1) {
      // Win the trick first, then handle going out
      const trickResult = winTrick(game, playerId);
      const winResult = handlePlayerWin(game, playerId);
      return { ...trickResult, ...winResult, playerWon: true };
    }
    // Player went out but trick continues - need to advance to next player who hasn't acted
    const winResult = handlePlayerWin(game, playerId);
    if (!game.roundEnded) {
      // Use the same logic as the main play handler to find next player
      // This ensures consistency
      const leadPlayerId = game.currentTrick[0]?.playerId;
      const leadPlayerIndex = leadPlayerId ? game.turnOrder.findIndex(p => p.id === leadPlayerId) : -1;
      
      // Clear passed players (new play resets passes)
      game.passedPlayers = [];
      
      // Get list of players who have already played in this trick
      const playersWhoHavePlayed = new Set(game.currentTrick.map(play => play.playerId));
      
      // Find next player who hasn't acted yet
      let nextPlayerIndex = (game.currentPlayerIndex + 1) % game.turnOrder.length;
      let attempts = 0;
      const maxAttempts = game.turnOrder.length;
      
      while (attempts < maxAttempts) {
        const nextPlayerId = game.turnOrder[nextPlayerIndex]?.id;
        if (!nextPlayerId) {
          nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
          attempts++;
          continue;
        }
        
        const hasGoneOut = game.playersOut?.includes(nextPlayerId);
        const hasNoCards = !game.hands[nextPlayerId] || game.hands[nextPlayerId].length === 0;
        const hasPlayed = playersWhoHavePlayed.has(nextPlayerId);
        
        // Skip the current player (who just played and went out) - they're already in playersOut
        const isCurrentPlayer = nextPlayerId === playerId;
        
        if (!hasGoneOut && !hasNoCards && !hasPlayed && !isCurrentPlayer) {
          break;
        }
        
        if (leadPlayerIndex !== -1 && nextPlayerIndex === leadPlayerIndex) {
          break;
        }
        
        nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
        attempts++;
      }
      
      game.currentPlayerIndex = nextPlayerIndex;
      return { ...winResult, success: true, game, playerWon: true };
    }
    return winResult;
  }
  
  // CRITICAL FIX: When a player plays (beats previous play), we need to advance to the NEXT player
  // who hasn't acted yet in this trick. We should NOT skip players who have passed (they already acted),
  // but we should find the next player who hasn't acted (not in passedPlayers and not in currentTrick).
  
  // Clear Dog priority when the player with priority plays a card
  if (game.dogPriorityPlayer === playerId) {
    game.dogPriorityPlayer = null;
  }
  
  // Move to next player who hasn't acted yet
  // Note: If Dog was played, don't advance turn - handleSpecialCards already set currentPlayerIndex to the partner
  if (!dogWasPlayed) {
    // Find the lead player (first player in this trick)
    // After adding the current play, the lead is the first entry in currentTrick
    const leadPlayerId = game.currentTrick[0]?.playerId;
    if (!leadPlayerId) {
      // This shouldn't happen - currentTrick should have at least one entry (the current play)
      // But handle it gracefully
      return { success: false, error: 'Invalid trick state - no lead player found' };
    }
    
    const leadPlayerIndex = game.turnOrder.findIndex(p => p.id === leadPlayerId);
    if (leadPlayerIndex === -1) {
      return { success: false, error: 'Lead player not found in turn order' };
    }
    
    // CRITICAL: Clear passed players BEFORE finding next player
    // When a new play is made, all previous passes are reset - players can act again
    game.passedPlayers = [];
    
    // Get list of players who have already played in this trick
    const playersWhoHavePlayed = new Set(game.currentTrick.map(play => play.playerId));
    
    // Verify that the current player is in the list of players who have played
    if (!playersWhoHavePlayed.has(playerId)) {
      return { success: false, error: 'Current player not found in trick' };
    }
    
    // Find next player who hasn't acted yet (not in currentTrick, hasn't gone out, has cards)
    // Start from the player AFTER the current player (who just played)
    // The current player is at game.currentPlayerIndex, so next is (currentPlayerIndex + 1) % length
    const currentPlayerIndexBefore = game.currentPlayerIndex;
    let nextPlayerIndex = (currentPlayerIndexBefore + 1) % game.turnOrder.length;
    let attempts = 0;
    const maxAttempts = game.turnOrder.length;
    
    while (attempts < maxAttempts) {
      const nextPlayerId = game.turnOrder[nextPlayerIndex]?.id;
      if (!nextPlayerId) {
        nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
        attempts++;
        continue;
      }
      
      // Skip if player has gone out or has no cards
      const hasGoneOut = game.playersOut?.includes(nextPlayerId);
      const hasNoCards = !game.hands[nextPlayerId] || game.hands[nextPlayerId].length === 0;
      
      // Check if this player has already played in this trick
      const hasPlayed = playersWhoHavePlayed.has(nextPlayerId);
      
      // If player hasn't played and can act, this is our next player
      if (!hasGoneOut && !hasNoCards && !hasPlayed) {
        // Found valid next player
        break;
      }
      
      // If we've wrapped back to lead player, stop (all players have acted)
      // This means we've gone through all players after the lead
      if (nextPlayerIndex === leadPlayerIndex) {
        // All players have acted - this will be handled by pass detection
        break;
      }
      
      // Move to next player
      nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
      attempts++;
    }
    // Set the next player as current
    game.currentPlayerIndex = nextPlayerIndex;
  } else {
    // Dog was played - passed players are already cleared by handleSpecialCards
    // Don't clear again, and don't advance (handleSpecialCards already set currentPlayerIndex)
  }
  
  // Wish stays active until the wished card is played
  // No need to check here - the wish will be enforced on the next player's turn
  // and cleared when the wished card is actually played
  
  return { success: true, game };
}

module.exports = {
  makeMove
};
