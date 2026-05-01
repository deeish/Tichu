/**
 * Player view logic
 * Creates sanitized game state views for individual players.
 * Accepts either socketId or stable player id; resolves so reconnecting players get their hand.
 */

const { getExchangeRecipients } = require('./exchange');
const { validateCombination, compareCombinations } = require('./combinations');
const { getCurrentWinningPlay } = require('./trickManager');
const { getCardValue } = require('./deck');

// Returns true if the player's hand contains any bomb that can beat winningCombo.
function handHasBeatingBomb(hand, winningCombo) {
  const trickIsBomb = winningCombo.type === 'bomb';
  const standardCards = hand.filter(c => c?.type === 'standard');

  // Four-of-a-kind
  const byRank = {};
  for (const card of standardCards) {
    byRank[card.rank] = (byRank[card.rank] || 0) + 1;
  }
  for (const [rank, count] of Object.entries(byRank)) {
    if (count >= 4) {
      if (!trickIsBomb) return true;
      if (winningCombo.bombType === 'four-of-a-kind' && getCardValue(rank) > getCardValue(winningCombo.rank)) return true;
    }
  }

  // Straight flush (5+ consecutive same suit; Phoenix cannot make a bomb)
  const bySuit = {};
  for (const card of standardCards) {
    if (!bySuit[card.suit]) bySuit[card.suit] = [];
    bySuit[card.suit].push(card);
  }
  for (const suitCards of Object.values(bySuit)) {
    if (suitCards.length < 5) continue;
    const sorted = [...suitCards].sort((a, b) => getCardValue(a.rank) - getCardValue(b.rank));
    let runStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const isEnd = i === sorted.length || getCardValue(sorted[i].rank) !== getCardValue(sorted[i - 1].rank) + 1;
      if (isEnd) {
        const runLen = i - runStart;
        if (runLen >= 5) {
          if (!trickIsBomb) return true;
          if (winningCombo.bombType === 'four-of-a-kind') return true;
          if (winningCombo.bombType === 'straight-flush') {
            if (runLen > winningCombo.length) return true;
            if (runLen === winningCombo.length) {
              const ourHighest = getCardValue(sorted[i - 1].rank);
              if (ourHighest > (winningCombo.highestValue ?? 0)) return true;
            }
          }
        }
        runStart = i;
      }
    }
  }
  return false;
}

function handHasHigherSingle(hand, winningCombo) {
  const topCard = winningCombo.cards?.[0];
  if (!topCard) return false;
  const topIsDragon = topCard.name === 'dragon';
  const topVal = topIsDragon ? 16
    : topCard.name === 'phoenix' ? (topCard.phoenixValue ?? 1.5)
    : topCard.name === 'mahjong' ? 1
    : topCard.type === 'standard' ? getCardValue(topCard.rank) : 0;
  for (const card of hand) {
    if (!card) continue;
    if (card.name === 'phoenix') { if (!topIsDragon) return true; continue; }
    if (card.name === 'dog') continue;
    const myVal = card.name === 'dragon' ? 16
      : card.name === 'mahjong' ? 1
      : card.type === 'standard' ? getCardValue(card.rank) : -1;
    if (myVal > topVal) return true;
  }
  return false;
}

function handHasHigherPair(hand, winningCombo) {
  const currentVal = getCardValue(winningCombo.rank);
  if (!currentVal) return false;
  const hasPhoenix = hand.some(c => c?.name === 'phoenix');
  const byRank = {};
  for (const card of hand) {
    if (card?.type === 'standard') byRank[card.rank] = (byRank[card.rank] || 0) + 1;
  }
  for (const [rank, count] of Object.entries(byRank)) {
    if (getCardValue(rank) > currentVal) {
      if (count >= 2 || (count >= 1 && hasPhoenix)) return true;
    }
  }
  return false;
}

function handHasHigherTriple(hand, winningCombo) {
  const currentVal = getCardValue(winningCombo.rank);
  if (!currentVal) return false;
  const hasPhoenix = hand.some(c => c?.name === 'phoenix');
  const byRank = {};
  for (const card of hand) {
    if (card?.type === 'standard') byRank[card.rank] = (byRank[card.rank] || 0) + 1;
  }
  for (const [rank, count] of Object.entries(byRank)) {
    if (getCardValue(rank) > currentVal) {
      if (count >= 3 || (count >= 2 && hasPhoenix)) return true;
    }
  }
  return false;
}

// Backtracking search: finds a subset of `hand` of size `k` that forms a valid combo beating winningCombo.
function findSubsetThatBeats(hand, k, winningCombo, startIdx, current) {
  if (current.length === k) {
    const validated = validateCombination(current);
    if (!validated.valid || validated.type !== winningCombo.type) return false;
    if (validated.type === 'sequence-of-pairs' && validated.numPairs !== winningCombo.numPairs) return false;
    return compareCombinations(validated, winningCombo) === 1;
  }
  if (hand.length - startIdx < k - current.length) return false;
  for (let i = startIdx; i < hand.length; i++) {
    current.push(hand[i]);
    if (findSubsetThatBeats(hand, k, winningCombo, i + 1, current)) return true;
    current.pop();
  }
  return false;
}

/**
 * Returns true if the player has at least one combination in their hand that can legally beat
 * the current trick (including bombs). Used to pause auto-pass when a move is available.
 */
function computeHasPlayableMove(hand, currentTrick, mahJongWish) {
  if (!Array.isArray(hand) || hand.length === 0) return false;
  if (!Array.isArray(currentTrick) || currentTrick.length === 0) return true;

  const winningPlay = getCurrentWinningPlay(currentTrick);
  if (!winningPlay?.combination) return true;
  const winningCombo = winningPlay.combination;

  // Mah Jong wish: player holding the wished card cannot legally pass
  if (mahJongWish?.mustPlay && mahJongWish?.wishedRank) {
    if (hand.some(c => c?.type === 'standard' && c?.rank === mahJongWish.wishedRank)) return true;
  }

  if (handHasBeatingBomb(hand, winningCombo)) return true;
  if (winningCombo.type === 'bomb') return false; // Only a higher bomb beats a bomb

  const trickLen = winningCombo.cards?.length;
  if (!trickLen) return false;

  switch (winningCombo.type) {
    case 'single': return handHasHigherSingle(hand, winningCombo);
    case 'pair':   return handHasHigherPair(hand, winningCombo);
    case 'triple': return handHasHigherTriple(hand, winningCombo);
    default:       return findSubsetThatBeats(hand, trickLen, winningCombo, 0, []);
  }
}

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
  const playerIdKey = playerId != null ? String(playerId) : null;

  // Per-player exchange receipts (full map must never leave the server on room-wide snapshots)
  if (game.exchangeReceiptByPlayer && typeof game.exchangeReceiptByPlayer === 'object') {
    const mine = playerIdKey != null ? game.exchangeReceiptByPlayer[playerIdKey] : null;
    view.exchangeReceipt = Array.isArray(mine) ? mine : null;
    delete view.exchangeReceiptByPlayer;
  } else {
    delete view.exchangeReceiptByPlayer;
    view.exchangeReceipt = null;
  }

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

  // Whether this player has at least one playable combination (used to pause auto-pass)
  if (game.state === 'playing') {
    const playerHand = Array.isArray(game.hands?.[playerId]) ? game.hands[playerId] : [];
    view.hasPlayableMove = computeHasPlayableMove(playerHand, game.currentTrick, game.mahJongWish);
  }

  return view;
}

module.exports = {
  getPlayerView
};
