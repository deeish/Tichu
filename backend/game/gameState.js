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
 * Handles card exchange
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
  
  // Store exchange cards
  game.exchangeCards[playerId] = cardsToExchange;
  game.exchangeComplete[playerId] = false;
  
  return { success: true, game };
}

/**
 * Completes the card exchange phase
 */
function completeExchange(game) {
  // First, collect all cards to be given (before removing from hands)
  const exchanges = [];
  const players = game.players;
  
  for (let i = 0; i < players.length; i++) {
    const giver = players[i];
    if (!game.exchangeCards[giver.id] || game.exchangeCards[giver.id].length !== 3) {
      return { success: false, error: 'All players must exchange 3 cards' };
    }
    
    const cardsToGive = [...game.exchangeCards[giver.id]];
    const opponents = players.filter(p => p.id !== giver.id && p.team !== giver.team);
    const partner = players.find(p => p.team === giver.team && p.id !== giver.id);
    
    exchanges.push({
      giver: giver.id,
      cards: cardsToGive,
      opponents: opponents.map(p => p.id),
      partner: partner?.id
    });
  }
  
  // Now perform the exchanges
  for (const exchange of exchanges) {
    const giverHand = game.hands[exchange.giver];
    let cardIndex = 0;
    
    // Give to opponents (2 cards)
    for (const opponentId of exchange.opponents) {
      if (cardIndex >= exchange.cards.length) break;
      const card = exchange.cards[cardIndex++];
      
      // Remove from giver's hand
      const cardPos = giverHand.findIndex(c => 
        c.type === card.type && 
        (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
      );
      if (cardPos !== -1) {
        giverHand.splice(cardPos, 1);
        game.hands[opponentId].push(card);
      }
    }
    
    // Give to partner (1 card)
    if (exchange.partner && cardIndex < exchange.cards.length) {
      const card = exchange.cards[cardIndex];
      const cardPos = giverHand.findIndex(c => 
        c.type === card.type && 
        (c.type === 'standard' ? c.suit === card.suit && c.rank === card.rank : c.name === card.name)
      );
      if (cardPos !== -1) {
        giverHand.splice(cardPos, 1);
        game.hands[exchange.partner].push(card);
      }
    }
  }
  
  // Clear exchange data
  game.exchangeCards = {};
  game.exchangeComplete = {};
  game.state = 'playing';
  
  return { success: true, game };
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
    
    // Check turn order for pass
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }
    
    // If there's a wish but player doesn't have the card, they can pass
    // The wish stays active for the next player
    game.passedPlayers.push(playerId);
    
    // Check if all players passed
    if (game.passedPlayers.length === game.players.length) {
      // Start new trick
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
    // Only bombs can beat bombs
    if (game.currentTrick.length > 0) {
      const currentTrickCombo = game.currentTrick[0].combination;
      
      // If current trick has a bomb, new bomb must beat it
      if (currentTrickCombo.type === 'bomb') {
        const comparison = compareCombinations(validation, currentTrickCombo);
        if (comparison === null || comparison <= 0) {
          return { success: false, error: 'Must play a higher bomb to beat the current bomb' };
        }
      }
      // If current trick doesn't have a bomb, any bomb can beat it (bomb beats everything)
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
    // The bomb wins the trick immediately, including all previous cards in the trick
    game.currentTrick.push({
      playerId,
      cards,
      combination: validation
    });
    
    // Clear passed players (bomb interrupts)
    game.passedPlayers = [];
    
    // Set bomb player as new lead
    game.leadPlayer = playerId;
    
    // Update turn order to start from bomb player for next trick
    const bombPlayerIndex = game.turnOrder.findIndex(p => p.id === playerId);
    if (bombPlayerIndex !== -1) {
      game.turnOrder = [
        ...game.turnOrder.slice(bombPlayerIndex),
        ...game.turnOrder.slice(0, bombPlayerIndex)
      ];
    }
    
    // Check if player won (empty hand)
    if (hand.length === 0) {
      return handlePlayerWin(game, playerId);
    }
    
    // Bomb wins the trick immediately - includes all cards in current trick (previous cards + bomb)
    const trickResult = winTrick(game, playerId);
    return { ...trickResult, bombPlayed: true };
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
  
  // If there's a current trick, validate the move beats it
  if (game.currentTrick.length > 0) {
    const currentTrickCombo = game.currentTrick[0].combination;
    
    // Only bombs can beat bombs
    if (currentTrickCombo.type === 'bomb' && validation.type !== 'bomb') {
      return { success: false, error: 'Only a bomb can beat a bomb. You must play a bomb or pass' };
    }
    
    const comparison = compareCombinations(validation, currentTrickCombo);
    
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
  
  // Handle wish fulfillment - wish is cleared when the wished card is played as a single
  if (game.mahJongWish && game.mahJongWish.mustPlay) {
    // Check if the played card fulfills the wish
    if (validation.type === 'single' && cards[0].type === 'standard' && 
        cards[0].rank === game.mahJongWish.wishedRank) {
      // Wish fulfilled, clear it
      game.mahJongWish = null;
    }
  }
  
  // Check if player won (empty hand)
  if (hand.length === 0) {
    return handlePlayerWin(game, playerId);
  }
  
  // Check if this is the only play in the trick (all others passed)
  if (game.passedPlayers.length === game.players.length - 1) {
    // Current player wins the trick
    return winTrick(game, playerId);
  }
  
  // Clear passed players (new play resets passes)
  game.passedPlayers = [];
  
  // Move to next player
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
      game.leadPlayer = partner.id;
      // Set turn to partner
      const partnerIndex = game.turnOrder.findIndex(p => p.id === partner.id);
      game.currentPlayerIndex = partnerIndex;
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
 */
function advanceTurn(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.turnOrder.length;
  
  // Skip players who have passed
  while (game.passedPlayers.includes(game.turnOrder[game.currentPlayerIndex].id)) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.turnOrder.length;
  }
}

/**
 * Starts a new trick
 */
function startNewTrick(game) {
  game.currentTrick = [];
  game.passedPlayers = [];
  game.currentPlayerIndex = game.turnOrder.findIndex(p => p.id === game.leadPlayer);
  // Wish persists across tricks until the wished card is played
  // Don't clear wish here - it will be cleared when the wished card is actually played
}

/**
 * Handles when a player wins a trick
 */
function winTrick(game, winnerId) {
  const winner = game.players.find(p => p.id === winnerId);
  
  // Calculate points from trick
  let trickPoints = 0;
  for (const play of game.currentTrick) {
    for (const card of play.cards) {
      trickPoints += getCardPoints(card);
    }
  }
  
  // Handle Dragon special rule
  if (game.dragonPlayed && game.dragonPlayed.playerId === winnerId) {
    // Dragon winner must give trick to opponent
    const opponents = game.players.filter(p => p.team !== winner.team);
    const opponent = opponents[0]; // Give to first opponent
    game.roundScores[`team${opponent.team}`] += trickPoints;
  } else {
    game.roundScores[`team${winner.team}`] += trickPoints;
  }
  
  // Store trick
  game.trickHistory.push({
    plays: [...game.currentTrick],
    winner: winnerId,
    points: trickPoints
  });
  
  // Set winner as new lead player
  game.leadPlayer = winnerId;
  game.dragonPlayed = null; // Clear dragon flag
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
      // Double victory! Team gets 200 points, skip counting
      game.roundScores[`team${firstPlayer.team}`] = 200;
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
  
  // Check if round should end (only one player has cards left)
  const playersWithCards = game.players.filter(p => 
    (game.hands[p.id] && game.hands[p.id].length > 0) || 
    !game.playersOut.includes(p.id)
  );
  
  if (playersWithCards.length === 1) {
    // Round ends - handle last player penalty
    const lastPlayer = playersWithCards[0];
    const lastPlayerObj = game.players.find(p => p.id === lastPlayer.id);
    const winner = game.players.find(p => p.id === game.playersOut[0]);
    
    // Last player gives remaining cards to opponents and tricks to winner
    // (This is handled in scoring - remaining cards count as 0 points, but go to opponents)
    // Tricks are already scored, but we need to ensure they go to the winner's team
    game.roundEnded = true;
    game.state = 'round-ended';
  }
  
  // Check Tichu declarations
  let tichuBonus = 0;
  if (game.tichuDeclarations[playerId]) {
    tichuBonus = 100;
    game.roundScores[`team${player.team}`] += tichuBonus;
  }
  if (game.grandTichuDeclarations[playerId]) {
    tichuBonus = 200;
    game.roundScores[`team${player.team}`] += tichuBonus;
  }
  
  // Check if other players failed Tichu
  for (const [pid, declared] of Object.entries(game.tichuDeclarations)) {
    if (declared && pid !== playerId) {
      const failedPlayer = game.players.find(p => p.id === pid);
      game.roundScores[`team${failedPlayer.team}`] -= 100;
    }
  }
  for (const [pid, declared] of Object.entries(game.grandTichuDeclarations)) {
    if (declared && pid !== playerId) {
      const failedPlayer = game.players.find(p => p.id === pid);
      game.roundScores[`team${failedPlayer.team}`] -= 200;
    }
  }
  
  // If round hasn't ended yet, continue playing
  if (!game.roundEnded) {
    return { success: true, game, playerWon: true, tichuBonus };
  }
  
  // Round ended - finalize scoring
  // Last player's remaining cards go to opponents (count as 0 points but are given to opponents)
  // Last player's tricks go to winner (already scored in winTrick)
  
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
  
  return { success: true, game, playerWon: true, tichuBonus, roundEnded: true };
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
