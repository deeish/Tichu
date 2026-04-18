/**
 * Game rules and constants for Tichu
 * Centralized configuration for game constants
 */

const WINNING_SCORE = 1000;

/**
 * Optional team scores when the host starts a game. Defaults to 0–0.
 * Clamped below WINNING_SCORE and snapped to multiples of 5 (Tichu totals move in 5s).
 */
function parseStartingScores(raw) {
  const def = { team1: 0, team2: 0 };
  if (!raw || typeof raw !== 'object') return def;
  // Arrays are objects; without this, raw.team1/raw.team2 are undefined and both become 0.
  if (Array.isArray(raw)) {
    return raw.length >= 2
      ? { team1: snapStartingTeamScore(raw[0]), team2: snapStartingTeamScore(raw[1]) }
      : def;
  }
  return {
    team1: snapStartingTeamScore(raw.team1),
    team2: snapStartingTeamScore(raw.team2),
  };
}

function snapStartingTeamScore(v) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return 0;
  const maxBelowWin = WINNING_SCORE - 1; // 999
  let x = Math.max(0, Math.min(maxBelowWin, n));
  x = Math.round(x / 5) * 5;
  if (x >= WINNING_SCORE) x = WINNING_SCORE - 5;
  return x;
}

module.exports = {
  // Scoring constants
  TICHU_POINTS: 100,
  GRAND_TICHU_POINTS: 200,
  WINNING_SCORE, // First team to reach 1000 wins. If both hit 1000 in same round, higher score wins.
  DOUBLE_VICTORY_POINTS: 200,
  
  // Card point values
  CARD_POINTS: {
    FIVE: 5,
    TEN: 10,
    KING: 10,
    DRAGON: 25,
    PHOENIX: -25
  },
  
  // Special card values
  SPECIAL_CARD_VALUES: {
    MAHJONG: 1,
    DOG: 0,
    DRAGON: 16,
    PHOENIX_LED: 1.5
  },
  
  // Game setup
  NUM_PLAYERS: 4,
  INITIAL_CARDS: 8,
  REMAINING_CARDS: 6,
  EXCHANGE_CARDS: 3,
  
  // Game states
  STATES: {
    WAITING: 'waiting',
    GRAND_TICHU: 'grand-tichu',
    EXCHANGING: 'exchanging',
    PLAYING: 'playing',
    ROUND_ENDED: 'round-ended',
    FINISHED: 'finished'
  },

  parseStartingScores,
};
