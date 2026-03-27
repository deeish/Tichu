/**
 * Defensive game-state normalization used by the client.
 * Kept in a standalone module so it can be unit-tested (Vitest) without React.
 */

const MAX_TRICK_PLAYS = 20
const MAX_CARDS_PER_PLAY = 20

// Freeze mitigation: cap roundLog and playerStacks so clone/render never see unbounded arrays.
const MAX_ROUND_LOG_ENTRIES = 80
const MAX_STACK_CARDS = 56

// Max hand size per player (Tichu max 14; 56 = one deck so clone stays bounded if server bugs).
const MAX_HAND_CARDS = 56

// Max trick history entries so long games don't blow up clone.
const MAX_TRICK_HISTORY = 100

// Max serialized game state size (bytes). If exceeded after caps we aggressively trim.
const MAX_GAME_PAYLOAD_BYTES = 1_500_000

export function normalizeGameState(game, { reportError } = {}) {
  if (!game || typeof game !== 'object') return game
  const next = { ...game }

  // Crash prevention: guarantee players and turnOrder are always arrays.
  next.players = Array.isArray(next.players) ? next.players : []

  // Per-player view only; strip if malformed (never trust wire shape).
  if (next.exchangeReceipt != null && !Array.isArray(next.exchangeReceipt)) {
    next.exchangeReceipt = null
  }
  if (Array.isArray(next.exchangeReceipt) && next.exchangeReceipt.length > 8) {
    next.exchangeReceipt = next.exchangeReceipt.slice(0, 8)
  }
  delete next.exchangeReceiptByPlayer

  const turnOrderRaw = next.turnOrder
  next.turnOrder =
    Array.isArray(turnOrderRaw) && turnOrderRaw.length >= 4
      ? turnOrderRaw
      : next.players.length >= 4
        ? [...next.players]
        : [...next.players]

  if (!Array.isArray(next.currentTrick)) next.currentTrick = []
  if (!Array.isArray(next.passedPlayers)) next.passedPlayers = []

  next.currentTrick = next.currentTrick
    .filter((p) => p && p.playerId != null && Array.isArray(p?.cards))
    .slice(0, MAX_TRICK_PLAYS)
    .map((p) => ({ ...p, cards: (p.cards || []).slice(0, MAX_CARDS_PER_PLAY) }))

  const turnLen = next.turnOrder.length
  if (
    turnLen > 0 &&
    (typeof next.currentPlayerIndex !== 'number' || next.currentPlayerIndex < 0 || next.currentPlayerIndex >= turnLen)
  ) {
    next.currentPlayerIndex = 0
  } else if (turnLen === 0) {
    next.currentPlayerIndex = 0
  }

  // Sanitize roundLog so every entry has entry.players as array (prevents Drawer crash).
  if (!Array.isArray(next.roundLog)) next.roundLog = []
  next.roundLog = next.roundLog
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({ ...e, players: Array.isArray(e.players) ? e.players : [] }))

  if (next.roundLog.length > MAX_ROUND_LOG_ENTRIES) {
    next.roundLog = next.roundLog.slice(-MAX_ROUND_LOG_ENTRIES)
  }

  if (next.playerStacks && typeof next.playerStacks === 'object') {
    const stacks = { ...next.playerStacks }
    for (const key of Object.keys(stacks)) {
      const stack = stacks[key]
      if (stack && Array.isArray(stack.cards) && stack.cards.length > MAX_STACK_CARDS) {
        stacks[key] = { ...stack, cards: stack.cards.slice(0, MAX_STACK_CARDS) }
      }
    }
    next.playerStacks = stacks
  }

  if (next.hands && typeof next.hands === 'object') {
    const hands = {}
    for (const key of Object.keys(next.hands)) {
      const arr = next.hands[key]
      hands[key] = Array.isArray(arr) ? arr.slice(0, MAX_HAND_CARDS) : []
    }
    next.hands = hands
  }

  if (Array.isArray(next.trickHistory) && next.trickHistory.length > MAX_TRICK_HISTORY) {
    next.trickHistory = next.trickHistory.slice(-MAX_TRICK_HISTORY)
  }

  // Memory exhaustion guard: if payload is still too large, aggressively trim and report.
  const rl = next.roundLog?.length ?? 0
  const th = next.trickHistory?.length ?? 0
  if (rl > 40 || th > 60) {
    try {
      const len = JSON.stringify(next).length
      if (len > MAX_GAME_PAYLOAD_BYTES) {
        next.roundLog = Array.isArray(next.roundLog) ? next.roundLog.slice(-10) : []
        next.trickHistory = Array.isArray(next.trickHistory) ? next.trickHistory.slice(-20) : []
        reportError?.({
          source: 'normalizeGameState',
          message: `Game payload too large (${len} bytes), trimmed roundLog/trickHistory`,
        })
      }
    } catch (_) {
      // ignore stringify failures
    }
  }

  return next
}

