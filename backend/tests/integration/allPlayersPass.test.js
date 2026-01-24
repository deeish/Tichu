/**
 * Integration test for all players pass scenario
 * When all players pass after lead plays, lead wins trick and plays again
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick, startNewTrick } = require('../../game/trickManager');
const { createTestGame, createCard } = require('../utils/testHelpers');

describe('All Players Pass Scenario', () => {
  let game;

  beforeEach(() => {
    game = createTestGame({
      state: 'playing',
      hands: {
        p1: [
          createCard('K', 'hearts'),
          createCard('A', 'hearts')
        ],
        p2: [
          createCard('Q', 'hearts')
        ],
        p3: [
          createCard('J', 'hearts')
        ],
        p4: [
          createCard('10', 'hearts')
        ]
      },
      currentTrick: [],
      passedPlayers: [],
      leadPlayer: 'p1',
      currentPlayerIndex: 0
    });
  });

  test('should allow lead player to win trick when all others pass', () => {
    // p1 plays K
    const p1Result = makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
    expect(p1Result.success).toBe(true);
    expect(game.currentTrick.length).toBe(1);
    expect(game.leadPlayer).toBe('p1');
    
    // p2 passes
    const p2Result = makeMove(game, 'p2', [], 'pass');
    expect(p2Result.success).toBe(true);
    expect(game.passedPlayers).toContain('p2');
    expect(game.currentTrick.length).toBe(1); // Trick still active
    
    // p3 passes
    const p3Result = makeMove(game, 'p3', [], 'pass');
    expect(p3Result.success).toBe(true);
    expect(game.passedPlayers).toContain('p3');
    expect(game.currentTrick.length).toBe(1); // Trick still active
    
    // p4 passes
    const p4Result = makeMove(game, 'p4', [], 'pass');
    expect(p4Result.success).toBe(true);
    
    // All players have passed - p1 should win the trick automatically
    // The game auto-wins when all others pass, so the trick might already be won
    // Check if trick was auto-won or needs manual winning
    let trickResult;
    if (p4Result.trickWon) {
      // Trick was auto-won
      trickResult = p4Result;
      expect(trickResult.winner).toBe('p1');
    } else {
      // Manually win the trick
      trickResult = winTrick(game, 'p1');
      expect(trickResult.success).toBe(true);
      expect(trickResult.winner).toBe('p1');
    }
    
    // p1 should have the cards in their stack
    expect(game.playerStacks.p1.cards.length).toBe(1); // K card
    expect(game.currentTrick.length).toBe(0); // Trick cleared
    
    // Start new trick - p1 should be lead again
    startNewTrick(game);
    expect(game.leadPlayer).toBe('p1');
    expect(game.currentTrick.length).toBe(0);
    expect(game.passedPlayers.length).toBe(0); // Cleared
  });

  test('should clear passed players when new trick starts', () => {
    // p1 plays
    makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
    
    // All others pass
    makeMove(game, 'p2', [], 'pass');
    makeMove(game, 'p3', [], 'pass');
    
    // After p3 passes, if p4 also passes, the trick might auto-win
    // So we need to check if trick was won or if we need to manually win it
    const p4Result = makeMove(game, 'p4', [], 'pass');
    
    // If trick was auto-won, it's already handled
    // Otherwise, manually win it
    if (game.currentTrick.length > 0) {
      winTrick(game, 'p1');
    }
    
    startNewTrick(game);
    
    // Passed players should be cleared
    expect(game.passedPlayers.length).toBe(0);
  });

  test('should allow lead player to play again after winning with all pass', () => {
    // p1 plays K
    makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
    
    // All pass
    makeMove(game, 'p2', [], 'pass');
    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p4', [], 'pass');
    
    // Win trick (might be auto-won, check first)
    if (game.currentTrick.length > 0) {
      winTrick(game, 'p1');
    }
    startNewTrick(game);
    
    // p1 should be able to play again (they're the lead)
    expect(game.leadPlayer).toBe('p1');
    expect(game.currentPlayerIndex).toBe(0); // p1's turn
    
    // p1 should be able to play their next card
    const nextPlayResult = makeMove(game, 'p1', [createCard('A', 'hearts')], 'play');
    expect(nextPlayResult.success).toBe(true);
    expect(game.currentTrick.length).toBe(1);
  });

  test('should handle all pass with bomb interrupt', () => {
    // Give p3 a bomb
    game.hands.p3 = [
      createCard('A', 'hearts'),
      createCard('A', 'diamonds'),
      createCard('A', 'clubs'),
      createCard('A', 'spades')
    ];
    
    // p1 plays K
    makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
    
    // p2 passes
    makeMove(game, 'p2', [], 'pass');
    
    // p3 plays bomb (interrupts)
    const bombResult = makeMove(game, 'p3', [
      createCard('A', 'hearts'),
      createCard('A', 'diamonds'),
      createCard('A', 'clubs'),
      createCard('A', 'spades')
    ], 'play');
    
    expect(bombResult.success).toBe(true);
    expect(bombResult.bombPlayed).toBe(true);
    expect(game.leadPlayer).toBe('p3'); // Bomb player becomes lead
    expect(game.passedPlayers.length).toBe(0); // Cleared by bomb
    
    // p4 passes
    makeMove(game, 'p4', [], 'pass');
    
    // p1 passes (can't beat bomb)
    makeMove(game, 'p1', [], 'pass');
    
    // p2 passes
    makeMove(game, 'p2', [], 'pass');
    
    // All have passed - p3 wins
    winTrick(game, 'p3');
    expect(game.playerStacks.p3.cards.length).toBeGreaterThan(0);
  });
});
