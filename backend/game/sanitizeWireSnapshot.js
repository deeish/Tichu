const { capGameForWire } = require('./capGameForWire');

/**
 * Sanitizes a game/player view right before sending over the wire.
 * Goal: avoid broadcasting structurally invalid snapshots that can crash the client UI.
 *
 * This function is intentionally conservative: it normalizes missing/invalid shapes into
 * safe empty structures (arrays/objects) and then applies the existing capping logic.
 *
 * @param {object} view
 * @returns {object} the same object reference (mutated) for simplicity
 */
function sanitizeWireSnapshot(view) {
  if (!view || typeof view !== 'object') return view;

  // Ensure core containers exist with safe types.
  view.players = Array.isArray(view.players) ? view.players : [];
  view.turnOrder = Array.isArray(view.turnOrder) ? view.turnOrder : [];
  view.currentTrick = Array.isArray(view.currentTrick) ? view.currentTrick : [];
  view.passedPlayers = Array.isArray(view.passedPlayers) ? view.passedPlayers : [];
  view.roundLog = Array.isArray(view.roundLog) ? view.roundLog : [];
  view.trickHistory = Array.isArray(view.trickHistory) ? view.trickHistory : [];

  // Ensure hands/stacks/stats containers exist as objects.
  view.hands = view.hands && typeof view.hands === 'object' && !Array.isArray(view.hands) ? view.hands : {};
  view.playerStacks = view.playerStacks && typeof view.playerStacks === 'object' && !Array.isArray(view.playerStacks) ? view.playerStacks : {};
  view.playerStats = view.playerStats && typeof view.playerStats === 'object' && !Array.isArray(view.playerStats) ? view.playerStats : {};
  view.exchangeCards = view.exchangeCards && typeof view.exchangeCards === 'object' && !Array.isArray(view.exchangeCards) ? view.exchangeCards : view.exchangeCards;
  view.exchangeComplete = view.exchangeComplete && typeof view.exchangeComplete === 'object' && !Array.isArray(view.exchangeComplete) ? view.exchangeComplete : view.exchangeComplete;
  view.exchangeRecipients = Array.isArray(view.exchangeRecipients) ? view.exchangeRecipients : view.exchangeRecipients;

  // Normalize scalar fields to safe defaults when missing.
  if (typeof view.currentPlayerIndex !== 'number' || Number.isNaN(view.currentPlayerIndex)) view.currentPlayerIndex = 0;
  if (typeof view.protocolVersion !== 'number' || Number.isNaN(view.protocolVersion)) view.protocolVersion = 1;
  if (!view.state || typeof view.state !== 'string') view.state = 'waiting';
  if (view.leadPlayer === undefined) view.leadPlayer = null;

  // Normalize roundLog entries: each entry.players must be an array.
  if (Array.isArray(view.roundLog)) {
    view.roundLog = view.roundLog
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        ...e,
        players: Array.isArray(e.players) ? e.players : [],
      }));
  }

  // Normalize hands entries: each hands[key] must be an array.
  if (view.hands && typeof view.hands === 'object') {
    for (const k of Object.keys(view.hands)) {
      if (!Array.isArray(view.hands[k])) view.hands[k] = [];
    }
  }

  // Normalize playerStacks: each stack must have cards array.
  if (view.playerStacks && typeof view.playerStacks === 'object') {
    for (const k of Object.keys(view.playerStacks)) {
      const stack = view.playerStacks[k];
      if (!stack || typeof stack !== 'object') {
        view.playerStacks[k] = { cards: [], points: 0 };
        continue;
      }
      if (!Array.isArray(stack.cards)) stack.cards = [];
      if (typeof stack.points !== 'number' || Number.isNaN(stack.points)) stack.points = 0;
    }
  }

  // Cap payload sizes and reduce freeze/crash risk.
  capGameForWire(view);

  // After capping, ensure again the arrays remain arrays (defensive).
  view.players = Array.isArray(view.players) ? view.players : [];
  view.turnOrder = Array.isArray(view.turnOrder) ? view.turnOrder : [];
  view.currentTrick = Array.isArray(view.currentTrick) ? view.currentTrick : [];
  view.passedPlayers = Array.isArray(view.passedPlayers) ? view.passedPlayers : [];
  view.roundLog = Array.isArray(view.roundLog) ? view.roundLog : [];
  view.trickHistory = Array.isArray(view.trickHistory) ? view.trickHistory : [];

  return view;
}

module.exports = { sanitizeWireSnapshot };

