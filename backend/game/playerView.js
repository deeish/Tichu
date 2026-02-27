/**
 * Player view logic
 * Creates sanitized game state views for individual players.
 * Accepts either socketId or stable player id; resolves so reconnecting players get their hand.
 */

const { getExchangeRecipients } = require('./exchange');

/**
 * Resolve socketId or player id to the player object. Used so reconnecting clients (new socket.id)
 * still get the view for their slot (same player.id, hand keyed by player.id).
 */
function findPlayerForView(game, socketIdOrPlayerId) {
  if (!game?.players) return null;
  return game.players.find(
    (p) => p.socketId === socketIdOrPlayerId || p.id === socketIdOrPlayerId
  ) || null;
}

/**
 * Gets sanitized game state for a specific player (hides other players' hands).
 * socketIdOrPlayerId: current socket.id or stable player.id (so reconnected clients get their hand).
 */
function getPlayerView(game, socketIdOrPlayerId) {
  const view = { ...game };
  const me = findPlayerForView(game, socketIdOrPlayerId);
  const playerId = me ? me.id : socketIdOrPlayerId;

  // Only show this player's hand (keyed by stable player.id so rejoin gets same cards)
  view.hands = {};
  view.hands[playerId] = game.hands[playerId];

  // Hide other players' hands but show count
  view.handCounts = {};
  game.players.forEach((player) => {
    if (player.id !== playerId) {
      view.handCounts[player.id] = game.hands[player.id]?.length || 0;
    }
  });

  // Only include token for this player (so only reconnecting client can store it)
  view.players = (game.players || []).map((p) => ({
    ...p,
    token: p.id === playerId ? p.token : undefined
  }));

  // During exchange, include who you pass each card to (order: 1st, 2nd, 3rd recipient)
  if (game.state === 'exchanging') {
    view.exchangeRecipients = getExchangeRecipients(game, playerId);
  }

  return view;
}

module.exports = {
  getPlayerView
};
