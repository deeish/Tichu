/**
 * Player view logic
 * Creates sanitized game state views for individual players
 */

const { getExchangeRecipients } = require('./exchange');

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
  getPlayerView
};
