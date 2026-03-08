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

  // Hide other players' hands but show count (include every other player so rejoin doesn't lose counts)
  view.handCounts = {};
  const hands = game.hands || {};
  game.players.forEach((player) => {
    if (player.id && player.id !== playerId) {
      view.handCounts[player.id] = hands[player.id]?.length ?? 0;
    }
  });

  // Only include token for this player (so only reconnecting client can store it).
  // Ensure every player has a display name so rejoin never shows blank/unknown.
  view.players = (game.players || []).map((p) => ({
    ...p,
    name: p.name || p.id || 'Player',
    token: p.id === playerId ? p.token : undefined
  }));

  // During exchange, include who you pass each card to (order: 1st, 2nd, 3rd recipient)
  if (game.state === 'exchanging') {
    view.exchangeRecipients = getExchangeRecipients(game, playerId);
    view.exchangeSubmitted = !!(game.exchangeComplete && game.exchangeComplete[playerId]);
  }

  return view;
}

module.exports = {
  getPlayerView
};
