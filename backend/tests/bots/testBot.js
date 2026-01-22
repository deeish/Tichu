/**
 * Test bot for automated game testing
 * Can be used to simulate players making moves automatically
 */

const { makeMove } = require('../../game/moveHandler');
const { validateCombination } = require('../../game/combinations');

class TestBot {
  constructor(playerId, strategy = 'random') {
    this.playerId = playerId;
    this.strategy = strategy;
    this.moveHistory = [];
  }

  /**
   * Makes a move based on the bot's strategy
   */
  makeMove(game) {
    const hand = game.hands[this.playerId];
    if (!hand || hand.length === 0) {
      return null; // No cards to play
    }

    // Check if it's this bot's turn
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    if (currentPlayer.id !== this.playerId) {
      return null; // Not this bot's turn
    }

    let move = null;

    switch (this.strategy) {
      case 'random':
        move = this.randomMove(game, hand);
        break;
      case 'aggressive':
        move = this.aggressiveMove(game, hand);
        break;
      case 'defensive':
        move = this.defensiveMove(game, hand);
        break;
      case 'test-dog':
        move = this.testDogMove(game, hand);
        break;
      case 'test-mahjong':
        move = this.testMahJongMove(game, hand);
        break;
      default:
        move = this.randomMove(game, hand);
    }

    if (move) {
      this.moveHistory.push(move);
    }

    return move;
  }

  /**
   * Random move strategy - plays random valid moves
   */
  randomMove(game, hand) {
    // If starting a new trick, play a random card
    if (game.currentTrick.length === 0) {
      const card = hand[Math.floor(Math.random() * hand.length)];
      return {
        cards: [card],
        action: 'play',
        mahJongWish: null
      };
    }

    // Try to beat current play
    const winningPlay = require('../../game/trickManager').getCurrentWinningPlay(game.currentTrick);
    if (!winningPlay) {
      return { action: 'pass' };
    }

    // Try random combinations to beat it
    for (let i = 0; i < 10; i++) {
      const numCards = Math.min(Math.floor(Math.random() * 3) + 1, hand.length);
      const cards = hand.slice(0, numCards);
      const validation = validateCombination(cards);
      
      if (validation.valid) {
        const comparison = require('../../game/combinations').compareCombinations(
          validation,
          winningPlay.combination
        );
        if (comparison === 1) {
          return {
            cards,
            action: 'play',
            mahJongWish: null
          };
        }
      }
    }

    // Can't beat, pass
    return { action: 'pass' };
  }

  /**
   * Aggressive strategy - always tries to play highest cards
   */
  aggressiveMove(game, hand) {
    // Sort hand by value (highest first)
    const sortedHand = [...hand].sort((a, b) => {
      const getValue = (card) => {
        if (card.type === 'special') {
          if (card.name === 'dragon') return 16;
        }
        const rankValues = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10 };
        return rankValues[card.rank] || parseInt(card.rank) || 0;
      };
      return getValue(b) - getValue(a);
    });

    if (game.currentTrick.length === 0) {
      return {
        cards: [sortedHand[0]],
        action: 'play',
        mahJongWish: null
      };
    }

    // Try to beat with highest card
    const winningPlay = require('../../game/trickManager').getCurrentWinningPlay(game.currentTrick);
    if (winningPlay) {
      for (const card of sortedHand) {
        const validation = validateCombination([card]);
        if (validation.valid) {
          const comparison = require('../../game/combinations').compareCombinations(
            validation,
            winningPlay.combination
          );
          if (comparison === 1) {
            return {
              cards: [card],
              action: 'play',
              mahJongWish: null
            };
          }
        }
      }
    }

    return { action: 'pass' };
  }

  /**
   * Defensive strategy - passes when possible, plays low cards
   */
  defensiveMove(game, hand) {
    if (game.currentTrick.length === 0) {
      // Play lowest card
      const sortedHand = [...hand].sort((a, b) => {
        const getValue = (card) => {
          if (card.type === 'special') return 0;
          const rankValues = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10 };
          return rankValues[card.rank] || parseInt(card.rank) || 0;
        };
        return getValue(a) - getValue(b);
      });
      return {
        cards: [sortedHand[0]],
        action: 'play',
        mahJongWish: null
      };
    }

    // Always pass if possible
    return { action: 'pass' };
  }

  /**
   * Test strategy - always plays Dog if available
   */
  testDogMove(game, hand) {
    const dog = hand.find(c => c.type === 'special' && c.name === 'dog');
    if (dog && game.currentTrick.length === 0) {
      return {
        cards: [dog],
        action: 'play',
        mahJongWish: null
      };
    }
    return this.randomMove(game, hand);
  }

  /**
   * Test strategy - plays Mah Jong with wish if available
   */
  testMahJongMove(game, hand) {
    const mahJong = hand.find(c => c.type === 'special' && c.name === 'mahjong');
    if (mahJong && game.currentTrick.length === 0) {
      return {
        cards: [mahJong],
        action: 'play',
        mahJongWish: 'K' // Wish for King
      };
    }
    return this.randomMove(game, hand);
  }
}

/**
 * Creates multiple bots for testing
 */
function createBots(strategies = ['random', 'random', 'random', 'random']) {
  const playerIds = ['p1', 'p2', 'p3', 'p4'];
  return playerIds.map((id, index) => new TestBot(id, strategies[index]));
}

/**
 * Runs a game simulation with bots
 */
function simulateGame(game, bots, maxMoves = 1000) {
  let moves = 0;
  const results = [];

  while (game.state === 'playing' && moves < maxMoves) {
    const currentPlayer = game.turnOrder[game.currentPlayerIndex];
    const bot = bots.find(b => b.playerId === currentPlayer.id);
    
    if (bot) {
      const move = bot.makeMove(game);
      if (move) {
        const result = makeMove(
          game,
          bot.playerId,
          move.cards || [],
          move.action,
          move.mahJongWish
        );
        results.push({ playerId: bot.playerId, move, result });
        
        if (!result.success && result.error) {
          console.error(`Bot ${bot.playerId} error:`, result.error);
          break;
        }
      }
    }

    moves++;
    
    // Safety check
    if (moves >= maxMoves) {
      console.warn('Max moves reached, stopping simulation');
      break;
    }
  }

  return { results, moves, finalState: game.state };
}

module.exports = {
  TestBot,
  createBots,
  simulateGame
};
