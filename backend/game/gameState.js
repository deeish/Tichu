/**
 * Game state management for Tichu
 * Re-exports all game logic functions for backward compatibility
 * 
 * This file maintains the original API while delegating to focused modules
 */

// Re-export all functions from split modules
const { initializeGame } = require('./initialization');
const { declareGrandTichu, revealRemainingCards, declareTichu } = require('./declarations');
const { getExchangeRecipients, exchangeCards, completeExchange } = require('./exchange');
const { makeMove } = require('./moveHandler');
const { selectDragonOpponent } = require('./trickManager');
const { getPlayerView } = require('./playerView');

module.exports = {
  initializeGame,
  declareGrandTichu,
  revealRemainingCards,
  declareTichu,
  exchangeCards,
  completeExchange,
  makeMove,
  selectDragonOpponent,
  getPlayerView
};
