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
 * Current holder of the trick = the player who last played (last entry in currentTrick).
 * Used as fallback for "lead" so we never use trick starter (currentTrick[0]) for end-of-trick logic,
 * which would incorrectly end the trick when the 4th player plays (BUGS.md).
 */
function getCurrentHolder(game) {
  if (!game.currentTrick || game.currentTrick.length === 0) return null;
  return game.currentTrick[game.currentTrick.length - 1].playerId;
}

/**
 * Whether this player has already acted "since the current leader" this trick.
 * "Lead" = whoever played last (current holder). We use the lead's LAST play index so that if
 * the same player plays again (e.g. P2 at index 1 and 4), only plays at or after index 4 count as acted (BUGS.md).
 */
function hasActedSinceLead(game, playerId, leadPlayerId) {
  if (game.passedPlayers.includes(playerId)) return true;
  const playIndex = game.currentTrick.findIndex(p => p.playerId === playerId);
  if (playIndex < 0) return false;
  // Use last occurrence of lead (most recent play by them) so "acted" = at or after that play
  let leadPlayIndex = -1;
  for (let i = game.currentTrick.length - 1; i >= 0; i--) {
    if (game.currentTrick[i].playerId === leadPlayerId) {
      leadPlayIndex = i;
      break;
    }
  }
  const cutoff = leadPlayIndex >= 0 ? leadPlayIndex : 0;
  return playIndex >= cutoff;
}

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

  // BUGS.md: Players who have finished their hand are out of the pool until next round - they cannot act.
  if (game.playersOut?.includes(playerId)) {
    return { success: false, error: 'You have already finished this round and cannot play or pass' };
  }

  // After Dragon wins a trick, points/cards must be passed out (opponent selected) before any next play
  if (game.dragonOpponentSelection) {
    const isDragonPlayer = game.dragonOpponentSelection.playerId === playerId;
    return {
      success: false,
      error: isDragonPlayer
        ? 'Select which opponent receives the Dragon trick (pass out points) before playing the next card'
        : 'Dragon opponent must be selected (pass out points) before the next card can be played'
    };
  }

  // Handle pass action (cannot be a bomb)
  // RULE (BUGS.md): Only players who did NOT start the round (not the lead) may pass.
  // Exceptions: player with Dog priority cannot pass; player who has the Mah Jong wished card cannot pass.
  if (action === 'pass') {
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // 1) Lead cannot pass (whoever has priority: winner of last trick or bomb player)
    if (game.leadPlayer === playerId) {
      return { success: false, error: 'You are the lead player and must play a card (cannot pass)' };
    }

    // 2) Player with Dog priority cannot pass
    if (game.dogPriorityPlayer === playerId) {
      return { success: false, error: 'You have priority from Dog and must play a card (cannot pass)' };
    }

    // 3) If current trick is empty, only the lead would have the turn; already blocked above
    if (game.currentTrick.length === 0) {
      return { success: false, error: 'You are the lead player and must play a card to start the trick (cannot pass)' };
    }

    // 4) Active Mah Jong wish: if player HAS the wished card they cannot pass (must play single or bomb containing that rank).
    // If they only have it in a bomb (4+ of that rank), they must play - cannot pass.
    if (game.mahJongWish && game.mahJongWish.mustPlay) {
      const hand = game.hands[playerId];
      const wishedRank = game.mahJongWish.wishedRank;
      const countWished = hand ? hand.filter(c => c.type === 'standard' && c.rank === wishedRank).length : 0;
      const hasWishedCard = countWished >= 1;
      if (hasWishedCard) {
        // If they have 4+ of that rank (only have it in a bomb), they cannot pass - must play bomb or one as single
        if (countWished >= 4) {
          return { success: false, error: `You must play ${wishedRank} as a single or in a bomb (cannot pass)` };
        }
        const trickEmpty = !game.currentTrick || game.currentTrick.length === 0;
        if (!trickEmpty) {
          const winningPlay = getCurrentWinningPlay(game.currentTrick);
          const currentCombo = winningPlay ? winningPlay.combination : null;
          if (currentCombo && currentCombo.type === 'single') {
            const wishedAsSingle = {
              type: 'single',
              cards: [{ type: 'standard', rank: wishedRank, suit: 'hearts' }]
            };
            const comparison = compareCombinations(wishedAsSingle, currentCombo);
            if (comparison === 1) {
              return { success: false, error: `You must play ${wishedRank} as a single card (cannot pass)` };
            }
          }
          // Current play is not a single (e.g. pair) - wished card as single can't beat; allow pass
        } else {
          return { success: false, error: `You must play ${wishedRank} as a single card or in a bomb (cannot pass)` };
        }
      }
    }

    // If there's a wish but player doesn't have the card, they can pass
    // The wish stays active for the next player
    game.passedPlayers.push(playerId);
    
    // Lead for "when to end trick" = current holder (who last played). When all 4 have played once, MUST use
    // last in trick so we don't end the trick until everyone has had a chance to pass (BUGS.md).
    const currentHolder = getCurrentHolder(game);
    const allFourPlayedOnce = game.currentTrick.length === game.players.length &&
      new Set(game.currentTrick.map(p => p.playerId)).size === game.players.length;
    const leadPlayerId = (allFourPlayedOnce ? currentHolder : null) || game.leadPlayer || currentHolder;
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
      
      // If the next player we would give the turn to is the lead, end the trick (don't give lead a second turn).
      // Check this BEFORE "hasn't acted" so we don't give the turn to the lead when they've played earlier in the trick (BUGS.md).
      const distinctPlayersInTrick = new Set(game.currentTrick.map(p => p.playerId)).size;
      const allFourPlayedOnce = game.currentTrick.length === game.players.length && distinctPlayersInTrick === game.players.length;
      const fourPlaysFewPasses = allFourPlayedOnce && game.passedPlayers.length < game.players.length - 1;
      if (nextPlayerIndex === leadPlayerIndex && !fourPlaysFewPasses) {
        const winningPlay = getCurrentWinningPlay(game.currentTrick);
        const winnerId = winningPlay ? winningPlay.playerId : leadPlayerId;
        // BUGS.md #3: When winner has empty hand (went out), add to playersOut before winTrick so startNewTrick skips them and round can end when all 4 out
        if (!game.hands[winnerId] || game.hands[winnerId].length === 0) {
          handlePlayerWin(game, winnerId);
          if (game.roundEnded) return { success: true, game, newTrick: true, playerWon: true, roundEnded: true };
        }
        const result = winTrick(game, winnerId);
        return { ...result, newTrick: true, ...(game.hands[winnerId]?.length === 0 ? { playerWon: true } : {}) };
      }
      
      // Acted since current leader (after a bomb, only pass or play at/after bomb counts)
      const hasActed = hasActedSinceLead(game, nextPlayerId, leadPlayerId);
      
      if (!hasGoneOut && !hasNoCards && !hasActed) {
        break;
      }
      
      nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
      attempts++;
    }
    
    game.currentPlayerIndex = nextPlayerIndex;
    
    // Not all players have acted yet; it's the next player's turn
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
  
  // BOMB INTERRUPT LOGIC: Bombs can be played at any time, except when Dog is the ONLY play.
  // Rule: You cannot bomb when Dog is played; after the dogged player plays their card(s), bombs are allowed.
  const isBomb = validation.type === 'bomb';
  if (isBomb) {
    // No one can bomb until Mah Jong has been played this round
    if (!game.mahJongPlayed) {
      return { success: false, error: 'Mah Jong must be played before any bomb can be played' };
    }
    // Lead with Mah Jong in hand cannot start the trick with a bomb - must play Mah Jong first
    if (game.leadPlayer === playerId && game.currentTrick.length === 0) {
      const hasMahJong = hand.some(card => card.name === 'mahjong');
      if (hasMahJong) {
        return { success: false, error: 'You must play Mah Jong first (cannot start with a bomb)' };
      }
    }

    const dogOnlyInTrick = game.currentTrick.length === 1 &&
      game.currentTrick[0].cards.some(c => c.name === 'dog');
    if (dogOnlyInTrick) {
      return { success: false, error: 'Bombs cannot be played when Dog is the only card in the trick (dogged player must play first)' };
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

    // Record bomb played for stats (only when bomb is actually played)
    if (game.playerStats && game.playerStats[playerId]) {
      game.playerStats[playerId].bombs = (game.playerStats[playerId].bombs || 0) + 1;
    }
    
    // Wish fulfillment: bomb containing the wished rank clears the wish (four-of-a-kind or straight-flush)
    if (game.mahJongWish && game.mahJongWish.mustPlay && cards.some(c =>
      c.type === 'standard' && c.rank === game.mahJongWish.wishedRank
    )) {
      game.mahJongWish = null;
    }
    
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
      // Lead is bomb player (game.leadPlayer) for wrap check
      const leadPlayerId = game.leadPlayer;
      const leadPlayerIndex = leadPlayerId ? game.turnOrder.findIndex(p => p.id === leadPlayerId) : 0;
      
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
        const hasActed = hasActedSinceLead(game, nextPlayerId, game.leadPlayer);
        
        if (!hasGoneOut && !hasNoCards && !hasActed) {
          break;
        }
        
        if (leadPlayerIndex !== -1 && nextPlayerIndex === leadPlayerIndex) {
          const bombWinnerId = game.leadPlayer;
          const trickResult = winTrick(game, bombWinnerId);
          return { ...trickResult, ...winResult, bombPlayed: true, playerWon: true, newTrick: true };
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
    // Lead is bomb player (game.leadPlayer); they are at index 0 after rotation. End when we'd return to index 0.
    const leadPlayerId = game.leadPlayer;
    const leadPlayerIndex = leadPlayerId ? game.turnOrder.findIndex(p => p.id === leadPlayerId) : 0;
    
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
      const hasActed = hasActedSinceLead(game, nextPlayerId, game.leadPlayer);
      
      if (!hasGoneOut && !hasNoCards && !hasActed) {
        break;
      }
      
      if (leadPlayerIndex !== -1 && nextPlayerIndex === leadPlayerIndex) {
        const bombWinnerId = game.leadPlayer;
        const result = winTrick(game, bombWinnerId);
        return { ...result, bombPlayed: true, newTrick: true };
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

  // Dog can only be played as lead - reject before "must beat" so we return the right error
  if (cards.some(c => c.name === 'dog') && game.currentTrick.length > 0) {
    return { success: false, error: 'Dog can only be played as the lead card' };
  }

  // Phoenix as single: value = last card played + 0.5 (or 1.5 if led). Must be set before "must beat" comparison.
  if (validation.type === 'single' && cards[0].name === 'phoenix') {
    const phoenixValue = getPhoenixValue(cards[0], game.currentTrick);
    cards[0].phoenixValue = phoenixValue;
    validation.phoenixValue = phoenixValue;
  }

  // If there's a current trick, validate the move beats the CURRENT HIGHEST play
  // (not the lead card - you must beat the last card played / current leader)
  // EXCEPTION: If Dog is the only card in the trick, the current player (whoever has the turn) can play any combination.
  // getCurrentWinningPlay skips Dog so would return null; without this we'd hit "Invalid trick state".
  // Use turn order as source of truth so this works even if dogPriorityPlayer was cleared or not synced (e.g. client round-trip).
  const dogInTrick = game.currentTrick.length === 1 && 
    game.currentTrick[0].cards.some(c => c.name === 'dog');
  const currentPlayerId = game.turnOrder[game.currentPlayerIndex]?.id;
  const canPlayAnyAfterDog = dogInTrick && (currentPlayerId === playerId);
  
  if (game.currentTrick.length > 0 && !canPlayAnyAfterDog) {
    // BUGS.md: When following, if you have the wished card you must play it (cannot play a different card e.g. 2 when wish is 7).
    if (game.mahJongWish && game.mahJongWish.mustPlay) {
      const hand = game.hands[playerId];
      const hasWishedCard = hand && hand.some(card =>
        card.type === 'standard' && card.rank === game.mahJongWish.wishedRank
      );
      const playingWishedRank = cards.some(c =>
        c.type === 'standard' && c.rank === game.mahJongWish.wishedRank
      );
      if (hasWishedCard && !playingWishedRank) {
        return { success: false, error: `You must play the wished card (${game.mahJongWish.wishedRank}) when you have it` };
      }
    }
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
    // Starting a new trick - if they HAVE the wished card they must lead with it (single or bomb containing that rank).
    // They can play one as single (e.g. one 2 from four 2's) or the full bomb; both clear the wish.
    if (game.mahJongWish && game.mahJongWish.mustPlay) {
      const hand = game.hands[playerId];
      const hasWishedCard = hand && hand.some(card =>
        card.type === 'standard' && card.rank === game.mahJongWish.wishedRank
      );
      if (hasWishedCard) {
        const playingWishedAsSingle = validation.type === 'single' && cards[0].type === 'standard' &&
            cards[0].rank === game.mahJongWish.wishedRank;
        const playingBombWithWish = validation.type === 'bomb' && cards.some(c =>
          c.type === 'standard' && c.rank === game.mahJongWish.wishedRank
        );
        if (!playingWishedAsSingle && !playingBombWithWish) {
          return { success: false, error: `You must play ${game.mahJongWish.wishedRank} as a single card or in a bomb to start this trick` };
        }
      }
      // Player does not have the wished card: no restriction from the wish (can play any valid combination)
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
  
  // Phoenix value already set above (before "must beat" check). Ensure card in hand ref has it for trick.
  if (validation.type === 'single' && cards[0].name === 'phoenix' && cards[0].phoenixValue === undefined) {
    cards[0].phoenixValue = getPhoenixValue(cards[0], game.currentTrick);
    validation.phoenixValue = cards[0].phoenixValue;
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
  
  // Current holder of the trick is the "lead": everyone after them must get one chance to respond before we can end.
  // (Bomb path and Dog set leadPlayer themselves; do not overwrite when Dog was played.)
  if (!dogWasPlayed) {
    game.leadPlayer = playerId;
  }
  
  // BUGS.md: Bulletproof guard - when all 4 have played and no one has passed, NEVER end the trick.
  const allPlayedNoPasses = game.currentTrick.length === game.players.length && (!game.passedPlayers || game.passedPlayers.length === 0);
  if (allPlayedNoPasses && !dogWasPlayed) {
    let winResult = null;
    const playerHandEmpty = !game.hands[playerId] || game.hands[playerId].length === 0;
    if (playerHandEmpty) {
      winResult = handlePlayerWin(game, playerId);
      if (game.roundEnded) return { ...winResult, success: true, game };
    }
    const nextIdx = (game.currentPlayerIndex + 1) % game.turnOrder.length;
    game.passedPlayers = [];
    game.currentPlayerIndex = nextIdx;
    if (game.dogPriorityPlayer === playerId) game.dogPriorityPlayer = null;
    return { success: true, game, ...(winResult || {}), ...(playerHandEmpty ? { playerWon: true } : {}) };
  }
  
  // Handle wish fulfillment - wish is cleared when the wished rank is played as a single OR in a bomb (four-of-a-kind or straight-flush containing that rank)
  if (game.mahJongWish && game.mahJongWish.mustPlay) {
    const playedWishedAsSingle = validation.type === 'single' && cards[0].type === 'standard' &&
        cards[0].rank === game.mahJongWish.wishedRank;
    const playedBombWithWish = validation.type === 'bomb' && cards.some(c =>
      c.type === 'standard' && c.rank === game.mahJongWish.wishedRank
    );
    if (playedWishedAsSingle || playedBombWithWish) {
      game.mahJongWish = null;
    }
  }
  
  // BUGS.md: First play of trick (e.g. Mah Jong on first turn) - advance to next in turn order who can act (not out, has cards).
  // When Dog was played, dogWasPlayed is true so we skip this block; preserve dogPriorityPlayer (set by handleSpecialCards).
  if (game.currentTrick.length === 1 && !dogWasPlayed) {
    game.passedPlayers = [];
    const onlyPlayIsDog = game.currentTrick[0].cards.some(c => c.name === 'dog');
    if (!onlyPlayIsDog && game.dogPriorityPlayer === playerId) game.dogPriorityPlayer = null;
    let nextIdx = (game.currentPlayerIndex + 1) % game.turnOrder.length;
    const maxAttempts = game.turnOrder.length;
    for (let i = 0; i < maxAttempts; i++) {
      const nextId = game.turnOrder[nextIdx]?.id;
      const out = nextId && (game.playersOut?.includes(nextId) || !(game.hands[nextId]?.length));
      if (!nextId || !out) break;
      nextIdx = (nextIdx + 1) % game.turnOrder.length;
    }
    game.currentPlayerIndex = nextIdx;
    const firstPlayHandEmpty = !game.hands[playerId] || game.hands[playerId].length === 0;
    if (firstPlayHandEmpty) {
      const winResult = handlePlayerWin(game, playerId);
      if (game.roundEnded) return { ...winResult, success: true, game };
    }
    return { success: true, game, ...(firstPlayHandEmpty ? { playerWon: true } : {}) };
  }
  
  // Check if player went out (empty hand) - handle this first
  // CRITICAL: If Dog was played, don't handle going out here - Dog already set the turn
  // The partner should get priority, not the next player in normal turn order
  if (hand.length === 0 && !dogWasPlayed) {
    // When Dragon is played (single), everyone must get a chance to play or pass before the trick can end
    const playJustAdded = game.currentTrick[game.currentTrick.length - 1];
    const isDragonSingle = playJustAdded?.cards?.some(c => c.name === 'dragon') && playJustAdded?.combination?.type === 'single';

    // Check if all others passed before going out - but never end trick on the same move when Dragon was just played
    if (game.passedPlayers.length === game.players.length - 1 && !isDragonSingle) {
      // Win the trick first, then handle going out
      const trickResult = winTrick(game, playerId);
      const winResult = handlePlayerWin(game, playerId);
      return { ...trickResult, ...winResult, playerWon: true };
    }
    // Player went out but trick continues - need to advance to next player who hasn't acted
    const winResult = handlePlayerWin(game, playerId);
    if (!game.roundEnded) {
      // Lead = current holder (who just played). Fallback to last in trick, never trick starter.
      const leadPlayerId = game.leadPlayer || getCurrentHolder(game);
      const leadPlayerIndex = leadPlayerId ? game.turnOrder.findIndex(p => p.id === leadPlayerId) : -1;
      
      // Clear passed players (new play resets passes)
      game.passedPlayers = [];
      
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
        const hasActed = hasActedSinceLead(game, nextPlayerId, leadPlayerId);
        
        if (!hasGoneOut && !hasNoCards && !hasActed) {
          break;
        }
        
        // All players have acted - end trick; winner is highest play, or player who just went out if unclear
        // Defensive: never end when the lead just played and no one has passed (same as normal play path).
        const leadJustPlayed = game.currentTrick.length > 0 &&
          game.currentTrick[game.currentTrick.length - 1].playerId === leadPlayerId;
        if (leadPlayerIndex !== -1 && nextPlayerIndex === leadPlayerIndex && !(leadJustPlayed && game.passedPlayers.length === 0)) {
          const winningPlay = getCurrentWinningPlay(game.currentTrick);
          const winnerId = winningPlay ? winningPlay.playerId : playerId;
          const trickResult = winTrick(game, winnerId);
          return { ...trickResult, ...winResult, playerWon: true, newTrick: true };
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
  
  // Clear Dog priority when the player with priority plays a card (except when they just played Dog - then priority stays so "must play single" applies)
  if (game.dogPriorityPlayer === playerId && !dogWasPlayed) {
    game.dogPriorityPlayer = null;
  }
  
  // Move to next player who hasn't acted yet
  // Note: If Dog was played, don't advance turn - handleSpecialCards already set currentPlayerIndex to the partner
  if (!dogWasPlayed) {
    // Lead = current holder (who just played). Fallback to last in trick, never trick starter (would end trick after 4th play).
    const leadPlayerId = game.leadPlayer || getCurrentHolder(game);
    if (!leadPlayerId) {
      return { success: false, error: 'Invalid trick state - no lead player found' };
    }
    
    const leadPlayerIndex = game.turnOrder.findIndex(p => p.id === leadPlayerId);
    if (leadPlayerIndex === -1) {
      return { success: false, error: 'Lead player not found in turn order' };
    }
    
    // CRITICAL: Clear passed players BEFORE finding next player
    // When a new play is made, all previous passes are reset - players can act again
    game.passedPlayers = [];
    
    // Verify that the current player is in the trick (they just played)
    if (game.currentTrick.every(p => p.playerId !== playerId)) {
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
      
      // Acted since current leader (after bomb, only play at/after bomb counts)
      const hasActed = hasActedSinceLead(game, nextPlayerId, leadPlayerId);
      
      if (!hasGoneOut && !hasNoCards && !hasActed) {
        break;
      }
      
      // If we've wrapped back to lead player, all players have acted - end the trick
      // Defensive: never end when the lead just played and no one has passed (everyone must get one chance to respond)
      const leadJustPlayed = game.currentTrick.length > 0 &&
        game.currentTrick[game.currentTrick.length - 1].playerId === leadPlayerId;
      if (nextPlayerIndex === leadPlayerIndex && !(leadJustPlayed && game.passedPlayers.length === 0)) {
        const winningPlay = getCurrentWinningPlay(game.currentTrick);
        const winnerId = winningPlay ? winningPlay.playerId : playerId;
        const result = winTrick(game, winnerId);
        if (!game.hands[playerId] || game.hands[playerId].length === 0) {
          const winResult = handlePlayerWin(game, playerId);
          if (game.roundEnded) return { ...result, ...winResult, newTrick: true };
          return { ...result, ...winResult, newTrick: true, playerWon: true };
        }
        return { ...result, newTrick: true };
      }
      
      // Move to next player
      nextPlayerIndex = (nextPlayerIndex + 1) % game.turnOrder.length;
      attempts++;
    }
    // Set the next player as current
    game.currentPlayerIndex = nextPlayerIndex;
    if (!game.hands[playerId] || game.hands[playerId].length === 0) {
      const winResult = handlePlayerWin(game, playerId);
      if (game.roundEnded) return { ...winResult, success: true, game, playerWon: true };
      return { ...winResult, success: true, game, playerWon: true };
    }
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
