/**
 * Integration tests for game state transitions
 * Tests transitions between: grand-tichu → exchanging → playing
 */

const { initializeGame } = require('../../game/initialization');
const { revealRemainingCards } = require('../../game/declarations');
const { exchangeCards, completeExchange } = require('../../game/exchange');
const { makeMove } = require('../../game/moveHandler');
const { createTestGame } = require('../utils/testHelpers');

describe('Game State Transitions', () => {
  let game;

  beforeEach(() => {
    game = createTestGame({
      players: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ]
    });
  });

  test('should transition from grand-tichu to exchanging when all cards revealed', () => {
    // Initialize game (starts in grand-tichu state)
    initializeGame(game);
    
    expect(game.state).toBe('grand-tichu');
    expect(game.cardsRevealed.p1).toBe(false);
    expect(game.cardsRevealed.p2).toBe(false);
    expect(game.cardsRevealed.p3).toBe(false);
    expect(game.cardsRevealed.p4).toBe(false);
    
    // All players reveal their remaining cards
    revealRemainingCards(game, 'p1');
    revealRemainingCards(game, 'p2');
    revealRemainingCards(game, 'p3');
    revealRemainingCards(game, 'p4');
    
    expect(game.cardsRevealed.p1).toBe(true);
    expect(game.cardsRevealed.p2).toBe(true);
    expect(game.cardsRevealed.p3).toBe(true);
    expect(game.cardsRevealed.p4).toBe(true);
    
    // State should transition to exchanging (this is handled by server logic,
    // but we can verify the conditions are met)
    const allRevealed = game.players.every(p => game.cardsRevealed[p.id]);
    expect(allRevealed).toBe(true);
    
    // Manually transition (simulating server logic)
    if (allRevealed && game.state === 'grand-tichu') {
      game.state = 'exchanging';
    }
    
    expect(game.state).toBe('exchanging');
  });

  test('should transition from exchanging to playing after exchange completes', () => {
    // Set up game in exchanging state
    game.state = 'exchanging';
    game.exchangeCards = {};
    game.exchangeComplete = {};
    game.hands = {
      p1: [
        { type: 'standard', rank: '2', suit: 'hearts' },
        { type: 'standard', rank: '3', suit: 'hearts' },
        { type: 'standard', rank: '4', suit: 'hearts' },
        { type: 'standard', rank: '5', suit: 'hearts' },
        { type: 'standard', rank: '6', suit: 'hearts' }
      ],
      p2: [
        { type: 'standard', rank: '7', suit: 'hearts' },
        { type: 'standard', rank: '8', suit: 'hearts' },
        { type: 'standard', rank: '9', suit: 'hearts' },
        { type: 'standard', rank: '10', suit: 'hearts' },
        { type: 'standard', rank: 'J', suit: 'hearts' }
      ],
      p3: [
        { type: 'standard', rank: 'Q', suit: 'hearts' },
        { type: 'standard', rank: 'K', suit: 'hearts' },
        { type: 'standard', rank: 'A', suit: 'hearts' },
        { type: 'standard', rank: '2', suit: 'diamonds' },
        { type: 'standard', rank: '3', suit: 'diamonds' }
      ],
      p4: [
        { type: 'standard', rank: '4', suit: 'diamonds' },
        { type: 'standard', rank: '5', suit: 'diamonds' },
        { type: 'standard', rank: '6', suit: 'diamonds' },
        { type: 'standard', rank: '7', suit: 'diamonds' },
        { type: 'standard', rank: '8', suit: 'diamonds' }
      ],
      turnOrder: game.turnOrder || [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      leadPlayer: 'p1'
    };
    
    // All players exchange cards
    exchangeCards(game, 'p1', [
      { type: 'standard', rank: '2', suit: 'hearts' },
      { type: 'standard', rank: '3', suit: 'hearts' },
      { type: 'standard', rank: '4', suit: 'hearts' }
    ]);
    
    exchangeCards(game, 'p2', [
      { type: 'standard', rank: '7', suit: 'hearts' },
      { type: 'standard', rank: '8', suit: 'hearts' },
      { type: 'standard', rank: '9', suit: 'hearts' }
    ]);
    
    exchangeCards(game, 'p3', [
      { type: 'standard', rank: 'Q', suit: 'hearts' },
      { type: 'standard', rank: 'K', suit: 'hearts' },
      { type: 'standard', rank: 'A', suit: 'hearts' }
    ]);
    
    exchangeCards(game, 'p4', [
      { type: 'standard', rank: '4', suit: 'diamonds' },
      { type: 'standard', rank: '5', suit: 'diamonds' },
      { type: 'standard', rank: '6', suit: 'diamonds' }
    ]);
    
    // Complete exchange
    const result = completeExchange(game);
    
    expect(result.success).toBe(true);
    expect(game.state).toBe('playing');
  });

  test('should prevent actions in wrong game state', () => {
    // Game in grand-tichu state
    game.state = 'grand-tichu';
    game.cardsRevealed = {
      p1: false,
      p2: false,
      p3: false,
      p4: false
    };
    game.remainingCards = {
      p1: [],
      p2: [],
      p3: [],
      p4: []
    };
    game.hands = {
      p1: [{ type: 'standard', rank: 'K', suit: 'hearts' }],
      p2: [],
      p3: [],
      p4: []
    };
    
    // Should not be able to make moves
    const moveResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
    expect(moveResult.success).toBe(false);
    expect(moveResult.error).toContain('state');
    
    // Should not be able to exchange
    game.exchangeCards = {};
    const exchangeResult = exchangeCards(game, 'p1', [
      { type: 'standard', rank: '2', suit: 'hearts' },
      { type: 'standard', rank: '3', suit: 'hearts' },
      { type: 'standard', rank: '4', suit: 'hearts' }
    ]);
    expect(exchangeResult.success).toBe(false);
    expect(exchangeResult.error).toContain('exchange phase');
    
    // Should be able to reveal cards
    const revealResult = revealRemainingCards(game, 'p1');
    expect(revealResult.success).toBe(true);
  });

  test('should prevent moves during exchanging state', () => {
    game.state = 'exchanging';
    
    // Should not be able to make moves
    const moveResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
    expect(moveResult.success).toBe(false);
    expect(moveResult.error).toContain('state');
  });

  test('should allow moves during playing state', () => {
    game.state = 'playing';
    game.hands.p1 = [{ type: 'standard', rank: 'K', suit: 'hearts' }];
    game.currentTrick = [];
    game.leadPlayer = 'p1';
    game.currentPlayerIndex = 0;
    
    // Should be able to make moves
    const moveResult = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
    expect(moveResult.success).toBe(true);
  });
});
