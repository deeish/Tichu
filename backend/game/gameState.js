/**
 * Game state management for Tichu
 * Handles game flow, turns, and state transitions
 */

const { createTichuDeck, dealInitialCards, getCardPoints } = require('./deck');
const { validateCombination, compareCombinations, getPhoenixValue } = require('./combinations');

/**
 * Initializes a new game round
 */
function initializeGame(game) {
  // Create and deal cards in two phases
  const deck = createTichuDeck();
  const { initialHands, remainingCards, remainingDeck } = dealInitialCards(deck, 4);
  
  // Set up hands for each player (initially only 8 cards visible)
  game.hands = {};
  game.remainingCards = {}; // Store the 6 cards to be revealed
  game.cardsRevealed = {}; // Track which players have revealed their remaining cards
  
  game.players.forEach((player, index) => {
    game.hands[player.id] = initialHands[index];
    game.remainingCards[player.id] = remainingCards[index];
    game.cardsRevealed[player.id] = false;
  });
  
  // Find player with Mah Jong (check in initial 8 cards + remaining cards)
  // Need to check both initial hand and remaining cards since Mah Jong might be in the 6 remaining cards
  let mahJongPlayer = null;
  for (const player of game.players) {
    const fullHand = [...game.hands[player.id], ...game.remainingCards[player.id]];
    if (fullHand.some(card => card.name === 'mahjong')) {
      mahJongPlayer = player;
      break;
    }
  }
  
  // If Mah Jong not found (shouldn't happen, but safety check), use first player
  if (!mahJongPlayer) {
    mahJongPlayer = game.players[0];
    console.warn('Mah Jong not found, using first player as lead');
  }
  
  // Set up turn order (starting with Mah Jong player)
  const mahJongIndex = game.players.findIndex(p => p.id === mahJongPlayer.id);
  game.turnOrder = [
    ...game.players.slice(mahJongIndex),
    ...game.players.slice(0, mahJongIndex)
  ];
  game.currentPlayerIndex = 0;
  game.leadPlayer = mahJongPlayer.id;
  
  // Initialize game state
  game.deck = remainingDeck;
  game.currentTrick = [];
  game.trickHistory = [];
  game.passedPlayers = [];
  game.tichuDeclarations = {};
  game.grandTichuDeclarations = {};
  game.exchangeCards = {}; // Track cards being exchanged
  game.exchangeComplete = {}; // Track who has completed exchange
  game.roundScores = { team1: 0, team2: 0 };
  game.firstCardPlayed = {}; // Track if each player has played their first card (for Tichu declaration)
  game.mahJongWish = null; // Track Mah Jong wish: { wishedRank: string, mustPlay: boolean }
  game.mahJongPlayed = false; // Track if Mah Jong has been played this round
  game.playersOut = []; // Track players who have gone out, in order
  game.roundEnded = false; // Track if round has ended
  // Track per-player stacks (cards won in tricks) - only awarded at round end unless last place
  game.playerStacks = {}; // { playerId: { cards: [...], points: number } }
  game.players.forEach(player => {
    game.playerStacks[player.id] = { cards: [], points: 0 };
  });
  
  // Phase 1: Grand Tichu declarations (after seeing 8 cards)
  game.state = 'grand-tichu';
  
  return game;
}

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

/**
 * Returns the 3 recipients for a giver during exchange, in a fixed order:
 * the other 3 players in turn order (clockwise: next, then next, then next).
 * Each recipient includes isPartner: true if same team as giver.
 */
function getExchangeRecipients(game, giverId) {
  const order = game.turnOrder || [];
  const idx = order.findIndex(p => p && p.id === giverId);
  if (idx === -1 || order.length !== 4) return [];
  const giver = order[idx];
  return [
    { ...order[(idx + 1) % 4], isPartner: order[(idx + 1) % 4].team === giver.team },
    { ...order[(idx + 2) % 4], isPartner: order[(idx + 2) % 4].team === giver.team },
    { ...order[(idx + 3) % 4], isPartner: order[(idx + 3) % 4].team === giver.team }
  ];
}

/**
 * Handles card exchange
 * cardsToExchange: [card0, card1, card2] where card0 → 1st recipient, card1 → 2nd, card2 → 3rd
 * (order matches getExchangeRecipients)
 */
function exchangeCards(game, playerId, cardsToExchange) {
  if (game.state !== 'exchanging') {
    return { success: false, error: 'Not the exchange phase' };
  }
  
  if (cardsToExchange.length !== 3) {
    return { success: false, error: 'Must exchange exactly 3 cards' };
  }
  
  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    return { success: false, error: 'Player not found' };
  }
  
  // Validate cards are in player's hand
  const hand = game.hands[playerId];
  for (const card of cardsToExchange) {
    const cardIndex = hand.findIndex(c => 
      c.type === card.type && 
      (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
    );
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand' };
    }
  }
  
  // Store exchange cards (order matches getExchangeRecipients: [for 1st, 2nd, 3rd])
  game.exchangeCards[playerId] = cardsToExchange;

  return { success: true, game };
}

/**
 * Completes the card exchange phase.
 * Each giver's cards[i] goes to getExchangeRecipients(...)[i].
 */
function completeExchange(game) {
  const exchanges = [];
  const players = game.players;

  for (let i = 0; i < players.length; i++) {
    const giver = players[i];
    if (!game.exchangeCards[giver.id] || game.exchangeCards[giver.id].length !== 3) {
      return { success: false, error: 'All players must exchange 3 cards' };
    }
    exchanges.push({ giver: giver.id, cards: [...game.exchangeCards[giver.id]] });
  }

  for (const exchange of exchanges) {
    const giverHand = game.hands[exchange.giver];
    const recipients = getExchangeRecipients(game, exchange.giver);
    if (recipients.length !== 3) {
      return { success: false, error: 'Invalid turn order for exchange' };
    }
    for (let i = 0; i < 3; i++) {
      const card = exchange.cards[i];
      const recipientId = recipients[i].id;
      const cardPos = giverHand.findIndex(c =>
        c.type === card.type &&
        (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
      );
      if (cardPos !== -1) {
        giverHand.splice(cardPos, 1);
        game.hands[recipientId].push(card);
      }
    }
  }
  
  // Clear exchange data
  game.exchangeCards = {};
  game.exchangeComplete = {};
  
  // After exchange, find who has Mah Jong now (it may have been passed)
  let newMahJongPlayer = null;
  for (const player of game.players) {
    const hand = game.hands[player.id] || [];
    if (hand.some(card => card.name === 'mahjong')) {
      newMahJongPlayer = player;
      break;
    }
  }
  
  // If Mah Jong not found (shouldn't happen), keep current lead player
  if (!newMahJongPlayer) {
    console.warn('Mah Jong not found after exchange, keeping current lead player');
    newMahJongPlayer = game.players.find(p => p.id === game.leadPlayer);
    if (!newMahJongPlayer) {
      newMahJongPlayer = game.players[0];
    }
  }
  
  // Update lead player and turn order to start with new Mah Jong holder
  game.leadPlayer = newMahJongPlayer.id;
  const mahJongIndex = game.players.findIndex(p => p.id === newMahJongPlayer.id);
  game.turnOrder = [
    ...game.players.slice(mahJongIndex),
    ...game.players.slice(0, mahJongIndex)
  ];
  game.currentPlayerIndex = 0;
  
  game.state = 'playing';
  
  return { success: true, game };
}

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
    
    // Lead player cannot pass - they must play a card to start the trick
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
    
    // Check if all players who haven't played have passed
    // If all non-playing players have passed, the current highest play wins the trick
    // Need to exclude players who have gone out from the calculation
    const playersWhoPlayed = game.currentTrick.length;
    const playersWhoHaveGoneOut = (game.playersOut && game.playersOut.length) || 0;
    const playersWhoCanStillAct = game.players.length - playersWhoHaveGoneOut;
    const playersWhoShouldPass = playersWhoCanStillAct - playersWhoPlayed;
    
    if (game.currentTrick.length > 0 && game.passedPlayers.length === playersWhoShouldPass) {
      const winningPlay = getCurrentWinningPlay(game.currentTrick);
      if (winningPlay) {
        const result = winTrick(game, winningPlay.playerId);
        return { ...result, newTrick: true };
      }
      // Fallback: if no winning play found, use the lead player
      const leadPlayerId = game.currentTrick[0]?.playerId;
      if (leadPlayerId) {
        const result = winTrick(game, leadPlayerId);
        return { ...result, newTrick: true };
      }
      startNewTrick(game);
      return { success: true, game, newTrick: true };
    }
    
    // Additional safety check: if all remaining players have passed, end the trick
    // This prevents infinite loops when advanceTurn can't find a valid player
    const remainingPlayers = game.players.filter(p => 
      !game.playersOut?.includes(p.id) && 
      game.hands[p.id] && 
      game.hands[p.id].length > 0
    );
    const allRemainingHavePassed = remainingPlayers.length > 0 && 
      remainingPlayers.every(p => game.passedPlayers.includes(p.id) || 
        game.currentTrick.some(play => play.playerId === p.id));
    
    if (game.currentTrick.length > 0 && allRemainingHavePassed) {
      const winningPlay = getCurrentWinningPlay(game.currentTrick);
      if (winningPlay) {
        const result = winTrick(game, winningPlay.playerId);
        return { ...result, newTrick: true };
      }
      // Fallback: use lead player
      const leadPlayerId = game.currentTrick[0]?.playerId;
      if (leadPlayerId) {
        const result = winTrick(game, leadPlayerId);
        return { ...result, newTrick: true };
      }
      startNewTrick(game);
      return { success: true, game, newTrick: true };
    }
    
    // Move to next player
    advanceTurn(game);
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
    const bombPlayerIndex = game.turnOrder.findIndex(p => p.id === playerId);
    if (bombPlayerIndex !== -1) {
      game.turnOrder = [
        ...game.turnOrder.slice(bombPlayerIndex),
        ...game.turnOrder.slice(0, bombPlayerIndex)
      ];
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
  if (game.currentTrick.length > 0) {
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
  
  // Handle wish fulfillment - wish is cleared when:
  // 1. The exact wished card is played as a single, OR
  // 2. Any card is played after Mah Jong (as a single)
  // Note: When Mah Jong is played as a single, it has NO value - its only role is to make a wish.
  // The wish is for "the next card to be played" - once someone plays any card after Mah Jong,
  // the wish is fulfilled/cleared, regardless of what card they played.
  if (game.mahJongWish && game.mahJongWish.mustPlay) {
    // Check if the exact wished card is played
    if (validation.type === 'single' && cards[0].type === 'standard' && 
        cards[0].rank === game.mahJongWish.wishedRank) {
      // Exact wished card played, clear wish
      game.mahJongWish = null;
    } else {
      // Check if Mah Jong was played as a single in this trick (meaning someone is playing after it)
      // Note: currentTrick already includes the new card at this point
      if (game.currentTrick.length >= 2) {
        const mahJongPlay = game.currentTrick.find(play => 
          play.combination.type === 'single' && play.cards[0].name === 'mahjong'
        );
        if (mahJongPlay) {
          // Someone played a card after Mah Jong (as a single) - wish is fulfilled/cleared
          // Mah Jong as a single has no value, so any card played after it fulfills the wish
          game.mahJongWish = null;
        }
      }
    }
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
  
  // Clear passed players (new play resets passes)
  game.passedPlayers = [];
  
  // Move to next player (skips those who have gone out)
  // Note: If all others pass, the check happens in the pass handler, not here
  advanceTurn(game);
  
  // Wish stays active until the wished card is played
  // No need to check here - the wish will be enforced on the next player's turn
  // and cleared when the wished card is actually played
  
  return { success: true, game };
}

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
    // Dog passes lead to partner
    const player = game.players.find(p => p.id === playerId);
    const partner = game.players.find(p => p.team === player.team && p.id !== playerId);
    if (partner) {
      // Check if partner has cards and hasn't gone out
      const partnerHasCards = game.hands[partner.id] && game.hands[partner.id].length > 0;
      const partnerHasGoneOut = game.playersOut && game.playersOut.includes(partner.id);
      
      if (partnerHasCards && !partnerHasGoneOut) {
        game.leadPlayer = partner.id;
        // Set turn to partner
        const partnerIndex = game.turnOrder.findIndex(p => p.id === partner.id);
        if (partnerIndex !== -1) {
          game.currentPlayerIndex = partnerIndex;
        }
      } else {
        // Partner has no cards or has gone out, find next player with cards
        const nextPlayer = getNextPlayerWithCards(game, partner.id);
        if (nextPlayer) {
          game.leadPlayer = nextPlayer.id;
          const nextIndex = game.turnOrder.findIndex(p => p.id === nextPlayer.id);
          if (nextIndex !== -1) {
            game.currentPlayerIndex = nextIndex;
          }
        }
      }
    }
  }
  
  // Check for Dragon
  const dragon = cards.find(c => c.name === 'dragon');
  if (dragon && combination.type === 'single') {
    // Dragon will need special handling when trick is won
    game.dragonPlayed = { playerId, trickIndex: game.trickHistory.length };
  }
  
  return { success: true };
}

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

/**
 * Starts a new trick
 * If the lead player has gone out (no cards), lead passes to next player with cards
 */
function startNewTrick(game) {
  game.currentTrick = [];
  game.passedPlayers = [];
  
  // If lead player has gone out, pass lead to next player with cards (rulebook)
  const leadHasNoCards = !game.hands[game.leadPlayer] || game.hands[game.leadPlayer].length === 0;
  if (leadHasNoCards) {
    const nextPlayer = getNextPlayerWithCards(game, game.leadPlayer);
    if (nextPlayer) {
      game.leadPlayer = nextPlayer.id;
    }
  }
  
  // Set current player index to lead player, but ensure they have cards
  const leadPlayerIndex = game.turnOrder.findIndex(p => p.id === game.leadPlayer);
  if (leadPlayerIndex !== -1) {
    const leadPlayerId = game.turnOrder[leadPlayerIndex].id;
    const leadHasCards = game.hands[leadPlayerId] && game.hands[leadPlayerId].length > 0;
    const leadHasGoneOut = game.playersOut && game.playersOut.includes(leadPlayerId);
    
    if (leadHasCards && !leadHasGoneOut) {
      game.currentPlayerIndex = leadPlayerIndex;
    } else {
      // Lead player has no cards or has gone out, find next player with cards
      const nextPlayer = getNextPlayerWithCards(game, leadPlayerId);
      if (nextPlayer) {
        game.leadPlayer = nextPlayer.id;
        const nextIndex = game.turnOrder.findIndex(p => p.id === nextPlayer.id);
        if (nextIndex !== -1) {
          game.currentPlayerIndex = nextIndex;
        }
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
  let actualWinnerId = winnerId;
  if (game.dragonPlayed && game.dragonPlayed.playerId === winnerId) {
    const opponents = game.players.filter(p => p.team !== winner.team);
    actualWinnerId = opponents[0]?.id || winnerId; // Give to first opponent
  }
  
  // Add cards to winner's stack (not immediately scored - scored at round end)
  if (!game.playerStacks[actualWinnerId]) {
    game.playerStacks[actualWinnerId] = { cards: [], points: 0 };
  }
  game.playerStacks[actualWinnerId].cards.push(...trickCards);
  game.playerStacks[actualWinnerId].points += trickPoints;
  
  // Store trick
  game.trickHistory.push({
    plays: [...game.currentTrick],
    winner: winnerId,
    actualWinner: actualWinnerId, // May differ if Dragon was played
    points: trickPoints
  });
  
  // Set winner as new lead player
  game.leadPlayer = winnerId;
  game.dragonPlayed = null; // Clear dragon flag
  
  // Clear Mah Jong wish if Mah Jong didn't win the trick
  // (If Mah Jong won, the wish would have been cleared when the wished card was played)
  if (game.mahJongWish && game.mahJongWish.mustPlay) {
    const mahJongInTrick = game.currentTrick.some(play => 
      play.cards.some(c => c.name === 'mahjong')
    );
    if (mahJongInTrick && winnerId !== game.currentTrick.find(play => 
      play.cards.some(c => c.name === 'mahjong')
    )?.playerId) {
      // Mah Jong was in the trick but didn't win, so wish is cleared
      game.mahJongWish = null;
    }
  }
  
  startNewTrick(game);
  
  return { success: true, game, trickWon: true, winner: winnerId };
}

/**
 * Handles when a player empties their hand
 */
function handlePlayerWin(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  
  // Track that this player has gone out
  if (!game.playersOut.includes(playerId)) {
    game.playersOut.push(playerId);
  }
  
  // Check for double victory: both teammates go out 1st and 2nd
  if (game.playersOut.length === 2) {
    const firstPlayer = game.players.find(p => p.id === game.playersOut[0]);
    const secondPlayer = game.players.find(p => p.id === game.playersOut[1]);
    
    if (firstPlayer && secondPlayer && firstPlayer.team === secondPlayer.team) {
      // Double victory! Team gets 200 points, skip counting cards
      // Add remaining players to playersOut (they're last)
      const remainingPlayers = game.players.filter(p => !game.playersOut.includes(p.id));
      remainingPlayers.forEach(p => {
        if (!game.playersOut.includes(p.id)) {
          game.playersOut.push(p.id);
        }
        // Add their remaining cards to stack (0 points)
        const remainingCards = game.hands[p.id] || [];
        if (!game.playerStacks[p.id]) {
          game.playerStacks[p.id] = { cards: [], points: 0 };
        }
        game.playerStacks[p.id].cards.push(...remainingCards);
      });
      
      // Double victory: winning team gets 200 points, losing team gets 0 (card points don't count)
      game.roundScores = { team1: 0, team2: 0 };
      
      // Set winning team to 200 points (base for double victory)
      game.roundScores[`team${firstPlayer.team}`] = 200;
      
      // Apply Tichu bonuses/penalties
      for (const p of game.players) {
        // Successful Tichu declarations (winning team only, since they finished)
        if (game.tichuDeclarations[p.id] && game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] += 100;
        }
        if (game.grandTichuDeclarations[p.id] && game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] += 200;
        }
        // Failed Tichu declarations (losing team only, since they didn't finish)
        if (game.tichuDeclarations[p.id] && !game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] -= 100;
        }
        if (game.grandTichuDeclarations[p.id] && !game.playersOut.includes(p.id)) {
          game.roundScores[`team${p.team}`] -= 200;
        }
      }
      
      game.roundEnded = true;
      game.state = 'round-ended';
      
      // Update total scores
      game.scores.team1 += game.roundScores.team1;
      game.scores.team2 += game.roundScores.team2;
      
      // Check for game win (1000 points)
      if (game.scores.team1 >= 1000 || game.scores.team2 >= 1000) {
        game.state = 'finished';
        game.winner = game.scores.team1 >= 1000 ? 1 : 2;
      } else {
        // Start new round
        initializeGame(game);
      }
      
      return { success: true, game, playerWon: true, doubleVictory: true };
    }
  }
  
  // Check if round should end (only one player has cards left = tailender)
  const playersWithCards = game.players.filter(p => !game.playersOut.includes(p.id));
  
  if (playersWithCards.length === 1) {
    // Round ends - add last player to playersOut
    const lastPlayer = playersWithCards[0];
    if (!game.playersOut.includes(lastPlayer.id)) {
      game.playersOut.push(lastPlayer.id);
    }
    
    // Add last player's remaining cards to their stack (they go to opponents, but count as 0 points)
    const remainingCards = game.hands[lastPlayer.id] || [];
    if (!game.playerStacks[lastPlayer.id]) {
      game.playerStacks[lastPlayer.id] = { cards: [], points: 0 };
    }
    game.playerStacks[lastPlayer.id].cards.push(...remainingCards);
    // Remaining cards count as 0 points (already initialized)
    
    game.roundEnded = true;
    game.state = 'round-ended';
  }
  
  // If round hasn't ended yet, continue playing
  if (!game.roundEnded) {
    return { success: true, game, playerWon: true };
  }
  
  // Round ended - finalize scoring
  // Finish order: playersOut[0] = 1st, playersOut[1] = 2nd, playersOut[2] = 3rd, playersOut[3] = 4th (last)
  
  // Last place penalty: last player gives all their points to first place
  if (game.playersOut.length === 4) {
    const firstPlaceId = game.playersOut[0];
    const lastPlaceId = game.playersOut[3];
    
    if (game.playerStacks[lastPlaceId] && game.playerStacks[lastPlaceId].points > 0) {
      const lastPlacePoints = game.playerStacks[lastPlaceId].points;
      // Transfer points from last to first
      if (!game.playerStacks[firstPlaceId]) {
        game.playerStacks[firstPlaceId] = { cards: [], points: 0 };
      }
      game.playerStacks[firstPlaceId].points += lastPlacePoints;
      game.playerStacks[lastPlaceId].points = 0; // Last place gets 0 points
    }
  }
  
  // Calculate team scores from player stacks
  game.roundScores = { team1: 0, team2: 0 };
  for (const player of game.players) {
    const stack = game.playerStacks[player.id];
    if (stack) {
      game.roundScores[`team${player.team}`] += stack.points;
    }
  }
  
  // Apply Tichu bonuses/penalties
  for (const player of game.players) {
    // Successful Tichu declarations
    if (game.tichuDeclarations[player.id] && game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] += 100;
    }
    if (game.grandTichuDeclarations[player.id] && game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] += 200;
    }
    
    // Failed Tichu declarations (declared but didn't finish)
    if (game.tichuDeclarations[player.id] && !game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] -= 100;
    }
    if (game.grandTichuDeclarations[player.id] && !game.playersOut.includes(player.id)) {
      game.roundScores[`team${player.team}`] -= 200;
    }
  }
  
  // Update total scores
  game.scores.team1 += game.roundScores.team1;
  game.scores.team2 += game.roundScores.team2;
  
  // Check for game win (1000 points)
  if (game.scores.team1 >= 1000 || game.scores.team2 >= 1000) {
    game.state = 'finished';
    game.winner = game.scores.team1 >= 1000 ? 1 : 2;
  } else {
    // Start new round
    initializeGame(game);
  }
  
  return { success: true, game, playerWon: true, roundEnded: true };
}

/**
 * Gets sanitized game state for a specific player (hides other players' hands)
 */
function getPlayerView(game, playerId) {
  const view = { ...game };

  // Only show this player's hand
  view.hands = {};
  view.hands[playerId] = game.hands[playerId];

  // Hide other players' hands but show count
  view.handCounts = {};
  game.players.forEach(player => {
    if (player.id !== playerId) {
      view.handCounts[player.id] = game.hands[player.id]?.length || 0;
    }
  });

  // During exchange, include who you pass each card to (order: 1st, 2nd, 3rd recipient)
  if (game.state === 'exchanging') {
    view.exchangeRecipients = getExchangeRecipients(game, playerId);
  }

  return view;
}

module.exports = {
  initializeGame,
  declareGrandTichu,
  revealRemainingCards,
  declareTichu,
  exchangeCards,
  completeExchange,
  makeMove,
  getPlayerView
};
