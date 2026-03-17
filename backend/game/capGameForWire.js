/**
 * Structural limits for game state sent to clients (freeze/crash mitigation).
 * Caps roundLog, trickHistory, hands, and playerStacks so wire payloads are always bounded.
 * See docs/FINALLY_KILLING_THE_FREEZE_BUG.md and docs/FREEZE_BUG_FIX.md.
 */

const MAX_ROUND_LOG_ENTRIES = 80;
const MAX_TRICK_HISTORY = 100;
const MAX_HAND_CARDS = 56;
const MAX_STACK_CARDS = 56;

/**
 * Mutates the view/game object in place to cap array sizes. Call before emitting game-update or game-state.
 * @param {Object} view - Game or player view (will be mutated)
 * @returns {Object} the same view (for chaining)
 */
function capGameForWire(view) {
  if (!view || typeof view !== 'object') return view;

  if (Array.isArray(view.roundLog) && view.roundLog.length > MAX_ROUND_LOG_ENTRIES) {
    view.roundLog = view.roundLog.slice(-MAX_ROUND_LOG_ENTRIES);
  }
  if (Array.isArray(view.trickHistory) && view.trickHistory.length > MAX_TRICK_HISTORY) {
    view.trickHistory = view.trickHistory.slice(-MAX_TRICK_HISTORY);
  }
  if (view.hands && typeof view.hands === 'object') {
    const hands = {};
    for (const key of Object.keys(view.hands)) {
      const arr = view.hands[key];
      hands[key] = Array.isArray(arr) ? arr.slice(0, MAX_HAND_CARDS) : [];
    }
    view.hands = hands;
  }
  if (view.playerStacks && typeof view.playerStacks === 'object') {
    const stacks = { ...view.playerStacks };
    for (const key of Object.keys(stacks)) {
      const stack = stacks[key];
      if (stack && Array.isArray(stack.cards) && stack.cards.length > MAX_STACK_CARDS) {
        stacks[key] = { ...stack, cards: stack.cards.slice(0, MAX_STACK_CARDS) };
      }
    }
    view.playerStacks = stacks;
  }
  return view;
}

module.exports = {
  capGameForWire
};
