/**
 * Game rules and constants for Tichu
 * Centralized configuration for game constants
 */

module.exports = {
  // Scoring constants
  TICHU_POINTS: 100,
  GRAND_TICHU_POINTS: 200,
  WINNING_SCORE: 1000,
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
  }
};
