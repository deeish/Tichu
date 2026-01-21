/**
 * Card exchange logic
 * Handles the card exchange phase between players
 */

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

module.exports = {
  getExchangeRecipients,
  exchangeCards,
  completeExchange
};
