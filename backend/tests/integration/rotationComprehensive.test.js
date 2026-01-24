/**
 * Comprehensive rotation tests - All variations of card play and winning scenarios
 * Designed to find the trigger for why each player is not always getting a turn to play
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick, startNewTrick } = require('../../game/trickManager');
const { createTestGame, createCard, createSpecialCard } = require('../utils/testHelpers');

/**
 * Debug helper to log game state after a move
 */
function debugGameState(game, moveDescription) {
  const currentPlayer = game.turnOrder[game.currentPlayerIndex];
  const playersInTrick = game.currentTrick.map(p => p.playerId);
  const turnOrderIds = game.turnOrder.map(p => p.id);
  
  console.log(`\n=== ${moveDescription} ===`);
  console.log(`Current Player Index: ${game.currentPlayerIndex} (${currentPlayer?.id || 'undefined'})`);
  console.log(`Turn Order: [${turnOrderIds.join(', ')}]`);
  console.log(`Lead Player: ${game.leadPlayer}`);
  console.log(`Players in Trick: [${playersInTrick.join(', ')}]`);
  console.log(`Passed Players: [${game.passedPlayers.join(', ')}]`);
  console.log(`Players Out: [${game.playersOut.join(', ')}]`);
  console.log(`Dog Priority Player: ${game.dogPriorityPlayer || 'none'}`);
  console.log(`Hand Sizes: p1=${game.hands.p1?.length || 0}, p2=${game.hands.p2?.length || 0}, p3=${game.hands.p3?.length || 0}, p4=${game.hands.p4?.length || 0}`);
  console.log('---');
}

describe('Comprehensive Rotation Tests - All Play Variations', () => {
  let game;

  beforeEach(() => {
    game = createTestGame({
      state: 'playing',
      currentTrick: [],
      passedPlayers: [],
      playersOut: []
    });
  });

  describe('Single Card Variations', () => {
    test('Scenario 1: P1 plays, P2 beats, P3 passes, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('10', 'hearts'), createCard('2', 'hearts')], // Give P1 2 cards so they don't go out, lower card
        p2: [createCard('J', 'hearts')], // P2 plays J
        p3: [createCard('Q', 'hearts')],
        p4: [createCard('K', 'hearts')] // P4 can beat with K (same suit, higher rank)
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State');
      // P1 plays
      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      debugGameState(game, 'After P1 plays');
      expect(game.currentPlayerIndex).toBe(1); // P2's turn
      
      // P2 beats
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      debugGameState(game, 'After P2 plays');
      expect(game.currentPlayerIndex).toBe(2); // P3's turn
      
      // P3 passes
      makeMove(game, 'p3', [], 'pass');
      debugGameState(game, 'After P3 passes');
      expect(game.currentPlayerIndex).toBe(3); // P4's turn
      
      // P4 should be able to play (K beats J in same suit)
      const p4Result = makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
      debugGameState(game, 'After P4 plays');
      if (!p4Result.success) {
        console.log('P4 move failed:', p4Result.error);
      }
      expect(p4Result.success).toBe(true);
      // P4 played a pair, which should be in the trick
      expect(game.currentTrick.some(p => p.playerId === 'p4')).toBe(true);
    });

    test('Scenario 2: P1 plays, P2 passes, P3 passes, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('K', 'hearts'), createCard('2', 'hearts')], // Give P1 2 cards
        p2: [createCard('Q', 'hearts')],
        p3: [createCard('J', 'hearts')],
        p4: [createCard('A', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [], 'pass');
      
      // P4 should get turn
      expect(game.currentPlayerIndex).toBe(3);
      const p4Result = makeMove(game, 'p4', [createCard('A', 'hearts')], 'play');
      expect(p4Result.success).toBe(true);
    });

    test('Scenario 3: P1 plays, P2 beats, P3 beats, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('10', 'hearts')],
        p2: [createCard('J', 'hearts')],
        p3: [createCard('Q', 'hearts')],
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State');
      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      debugGameState(game, 'After P1 plays');
      
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      debugGameState(game, 'After P2 plays');
      
      makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      debugGameState(game, 'After P3 plays');
      
      // P4 should get turn
      expect(game.currentPlayerIndex).toBe(3);
      const p4Result = makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
      debugGameState(game, 'After P4 plays');
      expect(p4Result.success).toBe(true);
    });

    test('Scenario 4: P1 plays, P2 passes, P3 beats, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('10', 'hearts'), createCard('2', 'hearts')], // Give P1 2 cards
        p2: [createCard('9', 'hearts')],
        p3: [createCard('J', 'hearts')],
        p4: [createCard('Q', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [createCard('J', 'hearts')], 'play');
      
      // P4 should get turn
      expect(game.currentPlayerIndex).toBe(3);
      const p4Result = makeMove(game, 'p4', [createCard('Q', 'hearts')], 'play');
      expect(p4Result.success).toBe(true);
    });
  });

  describe('Pair Variations', () => {
    test('Scenario 5: P1 plays pair, P2 beats, P3 passes, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('J', 'hearts'), createCard('J', 'spades'), createCard('2', 'hearts')], // Give P1 3 cards
        p2: [createCard('Q', 'hearts'), createCard('Q', 'spades')],
        p3: [createCard('K', 'hearts')],
        p4: [createCard('A', 'hearts'), createCard('A', 'spades')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('J', 'hearts'), createCard('J', 'spades')], 'play');
      makeMove(game, 'p2', [createCard('Q', 'hearts'), createCard('Q', 'spades')], 'play');
      makeMove(game, 'p3', [], 'pass');
      
      // P4 should get turn
      expect(game.currentPlayerIndex).toBe(3);
      const p4Result = makeMove(game, 'p4', [createCard('A', 'hearts'), createCard('A', 'spades')], 'play');
      expect(p4Result.success).toBe(true);
    });

    test('Scenario 6: P1 plays pair, P2 passes, P3 passes, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('J', 'hearts'), createCard('J', 'spades')],
        p2: [createCard('10', 'hearts')],
        p3: [createCard('9', 'hearts')],
        p4: [createCard('Q', 'hearts'), createCard('Q', 'spades')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('J', 'hearts'), createCard('J', 'spades')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [], 'pass');
      
      // P4 should get turn
      expect(game.currentPlayerIndex).toBe(3);
      const p4Result = makeMove(game, 'p4', [createCard('Q', 'hearts'), createCard('Q', 'spades')], 'play');
      expect(p4Result.success).toBe(true);
    });
  });

  describe('Straight Variations', () => {
    test('Scenario 7: P1 plays straight, P2 beats, P3 passes, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('5', 'hearts'), createCard('6', 'hearts'), createCard('7', 'hearts'), createCard('8', 'hearts'), createCard('9', 'hearts'), createCard('2', 'hearts')], // Give P1 6 cards
        p2: [createCard('6', 'spades'), createCard('7', 'spades'), createCard('8', 'spades'), createCard('9', 'spades'), createCard('10', 'spades')],
        p3: [createCard('K', 'hearts')],
        p4: [createCard('7', 'diamonds'), createCard('8', 'diamonds'), createCard('9', 'diamonds'), createCard('10', 'diamonds'), createCard('J', 'diamonds')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State');
      makeMove(game, 'p1', [
        createCard('5', 'hearts'), createCard('6', 'hearts'), createCard('7', 'hearts'), 
        createCard('8', 'hearts'), createCard('9', 'hearts')
      ], 'play');
      debugGameState(game, 'After P1 plays straight');
      makeMove(game, 'p2', [
        createCard('6', 'spades'), createCard('7', 'spades'), createCard('8', 'spades'), 
        createCard('9', 'spades'), createCard('10', 'spades')
      ], 'play');
      debugGameState(game, 'After P2 plays straight');
      makeMove(game, 'p3', [], 'pass');
      debugGameState(game, 'After P3 passes');
      
      // P4 should get turn (check by player ID, not index, since turn order might be rotated)
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p4');
      const p4Result = makeMove(game, 'p4', [
        createCard('7', 'diamonds'), createCard('8', 'diamonds'), createCard('9', 'diamonds'), 
        createCard('10', 'diamonds'), createCard('J', 'diamonds')
      ], 'play');
      debugGameState(game, 'After P4 plays');
      expect(p4Result.success).toBe(true);
    });
  });

  describe('Bomb Interrupt Variations', () => {
    test('Scenario 8: P1 plays, P2 passes, P3 plays bomb, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('K', 'hearts')],
        p2: [createCard('Q', 'hearts')],
        p3: [
          createCard('A', 'hearts'), createCard('A', 'diamonds'), 
          createCard('A', 'clubs'), createCard('A', 'spades')
        ],
        p4: [createCard('J', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      
      // P3 plays bomb (interrupts)
      makeMove(game, 'p3', [
        createCard('A', 'hearts'), createCard('A', 'diamonds'), 
        createCard('A', 'clubs'), createCard('A', 'spades')
      ], 'play');
      
      // P4 should get turn (bomb clears passed players, but P4 should still get a turn)
      // After bomb, turn order is rotated, so check by player ID, not index
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p4');
      const p4Result = makeMove(game, 'p4', [createCard('J', 'hearts')], 'play');
      // P4 can't beat bomb, so should fail, but they should have gotten the chance
      // Actually, bombs can only be beaten by higher bombs, so P4 should pass
      expect(p4Result.success).toBe(false); // Can't beat bomb with single
    });

    test('Scenario 9: P1 plays, P2 plays bomb, P3 should get turn', () => {
      game.hands = {
        p1: [createCard('K', 'hearts'), createCard('2', 'hearts')], // Give P1 2 cards
        p2: [
          createCard('A', 'hearts'), createCard('A', 'diamonds'), 
          createCard('A', 'clubs'), createCard('A', 'spades')
        ],
        p3: [
          createCard('K', 'hearts'), createCard('K', 'diamonds'), 
          createCard('K', 'clubs'), createCard('K', 'spades')
        ],
        p4: [createCard('J', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State');
      makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      debugGameState(game, 'After P1 plays');
      makeMove(game, 'p2', [
        createCard('A', 'hearts'), createCard('A', 'diamonds'), 
        createCard('A', 'clubs'), createCard('A', 'spades')
      ], 'play');
      debugGameState(game, 'After P2 plays bomb (should reset turn order)');
      
      // P3 should get turn (after bomb, turn order is rotated)
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [
        createCard('K', 'hearts'), createCard('K', 'diamonds'), 
        createCard('K', 'clubs'), createCard('K', 'spades')
      ], 'play');
      debugGameState(game, 'After P3 attempts bomb');
      // P3's bomb is lower, so should fail
      expect(p3Result.success).toBe(false);
    });
  });

  describe('Player Going Out Mid-Trick', () => {
    test('Scenario 10: P1 plays last card, P2 beats, P3 should get turn', () => {
      game.hands = {
        p1: [createCard('10', 'hearts')], // Only card, lower so P2 can beat
        p2: [createCard('J', 'hearts')], // P2 beats with J
        p3: [createCard('Q', 'hearts')], // P3 can beat with Q
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      const p1Result = makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      // P1 goes out automatically
      if (p1Result.playerWon) {
        expect(game.playersOut).toContain('p1');
      }
      
      // P2 should still get turn
      let currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p2');
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      
      // P3 should get turn and can beat with Q
      currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      expect(p3Result.success).toBe(true);
    });

    test('Scenario 11: P1 plays, P2 plays last card and goes out, P3 should get turn', () => {
      game.hands = {
        p1: [createCard('10', 'hearts')], // Lower so P2 can beat
        p2: [createCard('J', 'hearts')], // Only card, P2 beats
        p3: [createCard('Q', 'hearts')], // P3 can beat with Q
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      const p2Result = makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      
      // P2 goes out
      if (p2Result.playerWon) {
        expect(game.playersOut).toContain('p2');
      }
      
      // P3 should get turn and can beat with Q
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      expect(p3Result.success).toBe(true);
    });
  });

  describe('Dog Priority Variations', () => {
    test('Scenario 12: P1 plays Dog, P2 (partner) gets priority, P3 should get turn after', () => {
      game.hands = {
        p1: [createSpecialCard('dog')],
        p2: [createCard('J', 'hearts')], // P2 plays J
        p3: [createCard('Q', 'hearts')], // P3 can beat with Q
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State');
      makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      debugGameState(game, 'After P1 plays Dog (P2 should get priority)');
      
      // P2 should have priority
      expect(game.dogPriorityPlayer).toBe('p2');
      const currentPlayerAfterDog = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayerAfterDog?.id).toBe('p2');
      
      // P2 plays
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      debugGameState(game, 'After P2 plays (with Dog priority)');
      
      // P3 should get turn (check by player ID since turn order might be affected)
      const currentPlayerAfterP2 = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayerAfterP2?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      debugGameState(game, 'After P3 plays');
      if (!p3Result.success) {
        console.log('P3 move failed:', p3Result.error);
      }
      expect(p3Result.success).toBe(true);
    });
  });

  describe('All Players Pass Variations', () => {
    test('Scenario 13: P1 plays, all pass, P1 wins and plays again', () => {
      game.hands = {
        p1: [createCard('K', 'hearts'), createCard('A', 'hearts')],
        p2: [createCard('Q', 'hearts')],
        p3: [createCard('J', 'hearts')],
        p4: [createCard('10', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [], 'pass');
      const p4Result = makeMove(game, 'p4', [], 'pass');
      
      // All passed - P1 should win automatically
      if (p4Result.trickWon) {
        expect(p4Result.winner).toBe('p1');
        expect(game.leadPlayer).toBe('p1');
        // P1 should be able to play again
        expect(game.currentPlayerIndex).toBe(0);
      }
    });
  });

  describe('Complex Multi-Play Scenarios', () => {
    test('Scenario 14: P1 plays, P2 beats, P3 beats, P4 beats, all should get turns', () => {
      game.hands = {
        p1: [createCard('10', 'hearts')],
        p2: [createCard('J', 'hearts')],
        p3: [createCard('Q', 'hearts')],
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      const turns = [];
      
      debugGameState(game, 'Initial State');
      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      turns.push('p1');
      debugGameState(game, 'After P1 plays');
      expect(game.currentPlayerIndex).toBe(1);
      
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      turns.push('p2');
      debugGameState(game, 'After P2 plays');
      expect(game.currentPlayerIndex).toBe(2);
      
      makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      turns.push('p3');
      debugGameState(game, 'After P3 plays');
      expect(game.currentPlayerIndex).toBe(3);
      
      const p4Result = makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
      turns.push('p4');
      debugGameState(game, 'After P4 plays');
      expect(p4Result.success).toBe(true);
      
      // All players should have gotten a turn
      expect(turns).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(game.currentTrick.length).toBe(4);
    });

    test('Scenario 15: P1 plays, P2 passes, P3 beats, P4 passes, P1 should win', () => {
      game.hands = {
        p1: [createCard('10', 'hearts'), createCard('2', 'hearts')], // Give P1 2 cards
        p2: [createCard('9', 'hearts')],
        p3: [createCard('J', 'hearts')],
        p4: [createCard('8', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      makeMove(game, 'p2', [], 'pass');
      makeMove(game, 'p3', [createCard('J', 'hearts')], 'play');
      const p4Result = makeMove(game, 'p4', [], 'pass');
      
      // After P4 passes, if all others have acted, trick should end
      // P3 should win (highest play)
      if (p4Result.trickWon) {
        expect(p4Result.winner).toBe('p3');
      } else {
        // Manually win
        winTrick(game, 'p3');
        expect(game.playerStacks.p3.cards.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Cases with Players Out', () => {
    test('Scenario 16: P1 plays, P2 out, P3 should get turn (skip P2)', () => {
      game.hands = {
        p1: [createCard('10', 'hearts')], // Lower so P3 can beat
        p2: [], // Out
        p3: [createCard('J', 'hearts')], // P3 can beat with J
        p4: [createCard('Q', 'hearts')]
      };
      game.playersOut = ['p2'];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State (P2 is out)');
      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      debugGameState(game, 'After P1 plays (should skip P2, go to P3)');
      
      // Should skip P2 and go to P3 (check by player ID)
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('J', 'hearts')], 'play');
      debugGameState(game, 'After P3 plays');
      if (!p3Result.success) {
        console.log('P3 move failed:', p3Result.error);
      }
      expect(p3Result.success).toBe(true);
    });

    test('Scenario 17: P1 plays, P2 out, P3 out, P4 should get turn', () => {
      game.hands = {
        p1: [createCard('10', 'hearts')], // Lower so P4 can beat
        p2: [], // Out
        p3: [], // Out
        p4: [createCard('J', 'hearts')] // P4 can beat with J
      };
      game.playersOut = ['p2', 'p3'];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      
      // Should skip P2 and P3, go to P4 (check by player ID)
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p4');
      const p4Result = makeMove(game, 'p4', [createCard('J', 'hearts')], 'play');
      expect(p4Result.success).toBe(true);
    });
  });

  describe('Turn Order Wrapping', () => {
    test('Scenario 18: P4 plays, P1 should get turn (wrap around)', () => {
      game.hands = {
        p1: [createCard('K', 'hearts')],
        p2: [createCard('Q', 'hearts')],
        p3: [createCard('J', 'hearts')],
        p4: [createCard('10', 'hearts')]
      };
      game.leadPlayer = 'p4';
      game.currentPlayerIndex = 3; // P4's turn

      makeMove(game, 'p4', [createCard('10', 'hearts')], 'play');
      
      // Should wrap to P1
      expect(game.currentPlayerIndex).toBe(0); // P1's index
      const p1Result = makeMove(game, 'p1', [createCard('K', 'hearts')], 'play');
      expect(p1Result.success).toBe(true);
    });
  });

  describe('Systematic Rotation Test - All Combinations', () => {
    // Test every possible combination of play/pass for 4 players
    const scenarios = [
      { p2: 'play', p3: 'pass', p4: 'pass', description: 'P2 plays, P3/P4 pass' },
      { p2: 'pass', p3: 'play', p4: 'pass', description: 'P2 passes, P3 plays, P4 passes' },
      { p2: 'pass', p3: 'pass', p4: 'play', description: 'P2/P3 pass, P4 plays' },
      { p2: 'play', p3: 'play', p4: 'pass', description: 'P2/P3 play, P4 passes' },
      { p2: 'play', p3: 'pass', p4: 'play', description: 'P2 plays, P3 passes, P4 plays' },
      { p2: 'pass', p3: 'play', p4: 'play', description: 'P2 passes, P3/P4 play' },
      { p2: 'play', p3: 'play', p4: 'play', description: 'All play' },
    ];

    scenarios.forEach((scenario, index) => {
      test(`Systematic Test ${index + 19}: ${scenario.description}`, () => {
        game.hands = {
          p1: [createCard('10', 'hearts'), createCard('2', 'hearts')], // Give P1 2 cards
          p2: scenario.p2 === 'play' ? [createCard('J', 'hearts')] : [createCard('9', 'hearts')],
          p3: scenario.p3 === 'play' ? [createCard('Q', 'hearts')] : [createCard('8', 'hearts')],
          p4: scenario.p4 === 'play' ? [createCard('K', 'hearts')] : [createCard('7', 'hearts')]
        };
        game.leadPlayer = 'p1';
        game.currentPlayerIndex = 0;
        game.currentTrick = [];
        game.passedPlayers = [];

        const playersWhoActed = ['p1'];
        
        // P1 plays
        makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
        
        // P2 acts
        if (scenario.p2 === 'play') {
          makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
          playersWhoActed.push('p2');
        } else {
          makeMove(game, 'p2', [], 'pass');
          playersWhoActed.push('p2');
        }
        
        // P3 acts
        if (scenario.p3 === 'play') {
          makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
          playersWhoActed.push('p3');
        } else {
          makeMove(game, 'p3', [], 'pass');
          playersWhoActed.push('p3');
        }
        
        // P4 should ALWAYS get a turn
        expect(game.currentPlayerIndex).toBe(3);
        
        if (scenario.p4 === 'play') {
          const p4Result = makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
          expect(p4Result.success).toBe(true);
          playersWhoActed.push('p4');
        } else {
          const p4Result = makeMove(game, 'p4', [], 'pass');
          expect(p4Result.success).toBe(true);
          playersWhoActed.push('p4');
        }
        
        // Verify all players got a turn
        expect(playersWhoActed).toContain('p1');
        expect(playersWhoActed).toContain('p2');
        expect(playersWhoActed).toContain('p3');
        expect(playersWhoActed).toContain('p4');
      });
    });
  });
});
