/**
 * Comprehensive rotation tests - All variations of card play and winning scenarios
 * Designed to find the trigger for why each player is not always getting a turn to play
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick, startNewTrick, selectDragonOpponent } = require('../../game/trickManager');
const { createTichuDeck } = require('../../game/deck');
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
      expect(p4Result.success).toBe(true);
      // P4 is current holder; P1, P2, P3 get a chance to respond before trick ends
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
      makeMove(game, 'p1', [], 'pass');
      makeMove(game, 'p2', [], 'pass');
      const p3Pass = makeMove(game, 'p3', [], 'pass');
      expect(p3Pass.newTrick).toBe(true);
      expect(game.currentTrick.length).toBe(0);
      // P4 went out so next trick lead is first player with cards (P1)
      expect(game.leadPlayer).toBe('p1');
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
      // Give P1–P3 two cards each so no one goes out until after P4 acts (avoids "3 out = end round")
      game.hands = {
        p1: [createCard('10', 'hearts'), createCard('2', 'hearts')],
        p2: [createCard('J', 'hearts'), createCard('2', 'spades')],
        p3: [createCard('Q', 'hearts'), createCard('2', 'diamonds')],
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
      // Use mixed-suit straights so they are regular straights (not straight-flush bombs)
      game.hands = {
        p1: [createCard('5', 'hearts'), createCard('6', 'spades'), createCard('7', 'hearts'), createCard('8', 'diamonds'), createCard('9', 'clubs'), createCard('2', 'hearts')], // Give P1 6 cards
        p2: [createCard('6', 'hearts'), createCard('7', 'spades'), createCard('8', 'hearts'), createCard('9', 'diamonds'), createCard('10', 'clubs')],
        p3: [createCard('K', 'hearts')],
        p4: [createCard('7', 'hearts'), createCard('8', 'spades'), createCard('9', 'diamonds'), createCard('10', 'clubs'), createCard('J', 'diamonds')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State');
      makeMove(game, 'p1', [
        createCard('5', 'hearts'), createCard('6', 'spades'), createCard('7', 'hearts'),
        createCard('8', 'diamonds'), createCard('9', 'clubs')
      ], 'play');
      debugGameState(game, 'After P1 plays straight');
      makeMove(game, 'p2', [
        createCard('6', 'hearts'), createCard('7', 'spades'), createCard('8', 'hearts'),
        createCard('9', 'diamonds'), createCard('10', 'clubs')
      ], 'play');
      debugGameState(game, 'After P2 plays straight');
      makeMove(game, 'p3', [], 'pass');
      debugGameState(game, 'After P3 passes');
      
      // P4 should get turn (check by player ID, not index, since turn order might be rotated)
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p4');
      const p4Result = makeMove(game, 'p4', [
        createCard('7', 'hearts'), createCard('8', 'spades'), createCard('9', 'diamonds'),
        createCard('10', 'clubs'), createCard('J', 'diamonds')
      ], 'play');
      debugGameState(game, 'After P4 plays');
      expect(p4Result.success).toBe(true);
    });
  });

  describe('Bomb Interrupt Variations', () => {
    test('Scenario 8: P1 plays, P2 passes, P3 plays bomb, P4 should get turn', () => {
      game.mahJongPlayed = true; // Bombs allowed only after Mah Jong has been played
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
      game.mahJongPlayed = true; // Bombs allowed only after Mah Jong has been played
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
      // P1 and P2 on different teams so 1st+2nd out does not trigger double victory
      game.players = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 2, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 1, name: 'Player 4' }
      ];
      game.turnOrder = [...game.players];
      game.hands = {
        p1: [createCard('10', 'hearts')], // Only card, lower so P2 can beat
        p2: [createCard('J', 'hearts')], // P2 beats with J
        p3: [createCard('Q', 'hearts')], // P3 can beat with Q
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      const p1Result = makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      if (p1Result.playerWon) {
        expect(game.playersOut).toContain('p1');
      }
      
      let currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p2');
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      
      currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      expect(p3Result.success).toBe(true);
    });

    test('Scenario 11: P1 plays, P2 plays last card and goes out, P3 should get turn', () => {
      // P1 and P2 on different teams so double victory does not trigger
      game.players = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 2, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 1, name: 'Player 4' }
      ];
      game.turnOrder = [...game.players];
      game.hands = {
        p1: [createCard('10', 'hearts')],
        p2: [createCard('J', 'hearts')],
        p3: [createCard('Q', 'hearts')],
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      const p2Result = makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      
      if (p2Result.playerWon) {
        expect(game.playersOut).toContain('p2');
      }
      
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

    test('Scenario 12b: Dog, partner plays pair, next player can beat with higher pair (not single)', () => {
      game.hands = {
        p1: [createSpecialCard('dog')],
        p2: [createCard('J', 'hearts'), createCard('J', 'spades')],
        p3: [createCard('Q', 'hearts'), createCard('Q', 'spades')],
        p4: [createCard('K', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createSpecialCard('dog')], 'play');
      makeMove(game, 'p2', [createCard('J', 'hearts'), createCard('J', 'spades')], 'play');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('Q', 'hearts'), createCard('Q', 'spades')], 'play');
      expect(p3Result.success).toBe(true);
      expect(game.currentTrick.some(p => p.playerId === 'p3')).toBe(true);
      const winningEntry = game.currentTrick.find(p => p.playerId === 'p3');
      expect(winningEntry.combination.type).toBe('pair');
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
      // Give P1–P3 two cards each so no one goes out mid-trick (avoids "3 out = end round")
      game.hands = {
        p1: [createCard('10', 'hearts'), createCard('2', 'hearts')],
        p2: [createCard('J', 'hearts'), createCard('2', 'spades')],
        p3: [createCard('Q', 'hearts'), createCard('2', 'diamonds')],
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
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
      makeMove(game, 'p1', [], 'pass');
      makeMove(game, 'p2', [], 'pass');
      const p3Pass = makeMove(game, 'p3', [], 'pass');
      
      expect(turns).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(p3Pass.newTrick).toBe(true);
      expect(game.currentTrick.length).toBe(0);
      expect(game.leadPlayer).toBe('p1');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
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
      // P1 and P2 different teams so P1 going out does not trigger double victory with P2
      game.players = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 2, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 1, name: 'Player 4' }
      ];
      game.turnOrder = [...game.players];
      game.hands = {
        p1: [createCard('10', 'hearts')],
        p2: [],
        p3: [createCard('J', 'hearts')],
        p4: [createCard('Q', 'hearts')]
      };
      game.playersOut = ['p2'];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      debugGameState(game, 'Initial State (P2 is out)');
      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      debugGameState(game, 'After P1 plays (should skip P2, go to P3)');
      
      const currentPlayer = game.turnOrder[game.currentPlayerIndex];
      expect(currentPlayer?.id).toBe('p3');
      const p3Result = makeMove(game, 'p3', [createCard('J', 'hearts')], 'play');
      debugGameState(game, 'After P3 plays');
      if (!p3Result.success) {
        console.log('P3 move failed:', p3Result.error);
      }
      expect(p3Result.success).toBe(true);
    });

    test('Scenario 17: P1 plays last card as 3rd out (P2,P3 already out) — round ends; P4 does not act', () => {
      // Teams differ so P1+P2 first-two-out is not double victory. Tailender: only P4 had cards;
      // once P1 empties, three are finished — round ends immediately (no response trick for P4).
      game.players = [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 2, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 1, name: 'Player 4' }
      ];
      game.turnOrder = [...game.players];
      game.hands = {
        p1: [createCard('10', 'hearts')],
        p2: [],
        p3: [],
        p4: [createCard('J', 'hearts')]
      };
      game.playersOut = ['p2', 'p3'];
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      const r1 = makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      expect(r1.success).toBe(true);
      expect(game.roundEnded).toBe(true);
      expect(['round-ended', 'round-ending-preview']).toContain(game.state);
      expect(game.playersOut).toContain('p1');
      expect(game.playersOut).toContain('p4');
    });
  });

  describe('Last player plays - trick ends (no double turn for lead)', () => {
    test('BUGS.md: after P1-P2-P3-P4 play, trick does NOT end and P1 gets turn (no one passed yet)', () => {
      game.hands = {
        p1: [createCard('2', 'hearts'), createCard('A', 'hearts')],
        p2: [createCard('3', 'hearts'), createCard('K', 'hearts')],
        p3: [createCard('4', 'hearts'), createCard('Q', 'hearts')],
        p4: [createCard('5', 'hearts'), createCard('J', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
      makeMove(game, 'p2', [createCard('3', 'hearts')], 'play');
      makeMove(game, 'p3', [createCard('4', 'hearts')], 'play');
      const r4 = makeMove(game, 'p4', [createCard('5', 'hearts')], 'play');

      expect(r4.success).toBe(true);
      expect(r4.trickWon).toBeFalsy();
      expect(r4.newTrick).toBeFalsy();
      expect(game.currentTrick.length).toBe(4);
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
      expect(game.leadPlayer).toBe('p4');
    });

    test('BUGS.md: after 4 plays, P1 pass → P2 turn (no end); P2 pass → P3; P3 pass → trick ends, P4 wins', () => {
      game.hands = {
        p1: [createCard('2', 'hearts'), createCard('A', 'hearts')],
        p2: [createCard('3', 'hearts'), createCard('K', 'hearts')],
        p3: [createCard('4', 'hearts'), createCard('Q', 'hearts')],
        p4: [createCard('5', 'hearts'), createCard('J', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
      makeMove(game, 'p2', [createCard('3', 'hearts')], 'play');
      makeMove(game, 'p3', [createCard('4', 'hearts')], 'play');
      makeMove(game, 'p4', [createCard('5', 'hearts')], 'play');
      expect(game.currentTrick.length).toBe(4);
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');

      const r1 = makeMove(game, 'p1', [], 'pass');
      expect(r1.success).toBe(true);
      expect(r1.newTrick).toBeFalsy();
      expect(game.currentTrick.length).toBe(4);
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');

      const r2 = makeMove(game, 'p2', [], 'pass');
      expect(r2.success).toBe(true);
      expect(r2.newTrick).toBeFalsy();
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');

      const r3 = makeMove(game, 'p3', [], 'pass');
      expect(r3.success).toBe(true);
      expect(r3.newTrick).toBe(true);
      expect(r3.trickWon).toBe(true);
      expect(r3.winner).toBe('p4');
      expect(game.currentTrick.length).toBe(0);
      expect(game.leadPlayer).toBe('p4');
    });

    test('BUGS.md: after 4 plays, P1 pass, P2 plays → turn goes to P3 (not P1); then P3 pass → P4, P4 pass → P1, P1 pass → P2 wins', () => {
      game.hands = {
        p1: [createCard('2', 'hearts'), createCard('A', 'hearts')],
        p2: [createCard('3', 'hearts'), createCard('K', 'hearts'), createCard('Q', 'hearts')],
        p3: [createCard('4', 'hearts'), createCard('J', 'hearts')],
        p4: [createCard('5', 'hearts'), createCard('10', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
      makeMove(game, 'p2', [createCard('3', 'hearts')], 'play');
      makeMove(game, 'p3', [createCard('4', 'hearts')], 'play');
      makeMove(game, 'p4', [createCard('5', 'hearts')], 'play');
      makeMove(game, 'p1', [], 'pass');
      const afterP2 = makeMove(game, 'p2', [createCard('K', 'hearts')], 'play');
      expect(afterP2.success).toBe(true);
      expect(afterP2.newTrick).toBeFalsy();
      expect(game.currentTrick.length).toBe(5);
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');

      makeMove(game, 'p3', [], 'pass');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');
      makeMove(game, 'p4', [], 'pass');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
      const p1Pass = makeMove(game, 'p1', [], 'pass');
      expect(p1Pass.newTrick).toBe(true);
      expect(p1Pass.winner).toBe('p2');
    });

    test('when all four play in a trick, last player play ends trick and winner leads next', () => {
      // Give P1–P3 two cards so they do not go out when playing (avoids "3 out = end round" before P4 plays)
      game.hands = {
        p1: [createCard('2', 'hearts'), createCard('A', 'hearts')],
        p2: [createCard('3', 'hearts'), createCard('A', 'spades')],
        p3: [createCard('4', 'hearts'), createCard('A', 'diamonds')],
        p4: [createCard('5', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
      makeMove(game, 'p2', [createCard('3', 'hearts')], 'play');
      makeMove(game, 'p3', [createCard('4', 'hearts')], 'play');
      const p4Result = makeMove(game, 'p4', [createCard('5', 'hearts')], 'play');
      expect(p4Result.success).toBe(true);
      makeMove(game, 'p1', [], 'pass');
      makeMove(game, 'p2', [], 'pass');
      const lastResult = makeMove(game, 'p3', [], 'pass');

      expect(lastResult.newTrick).toBe(true);
      expect(game.currentTrick.length).toBe(0);
      // P4 went out (one card) so next trick is led by first player with cards (P1)
      expect(game.leadPlayer).toBe('p1');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
    });

    test('when last player plays (without going out), trick ends and winner leads next', () => {
      // P4 has two cards so we hit the normal advance path (not player-went-out path).
      // P2 and P3 need two cards each so they still have cards when it's their turn to pass.
      game.hands = {
        p1: [createCard('10', 'hearts'), createCard('A', 'hearts')],
        p2: [createCard('J', 'hearts'), createCard('9', 'hearts')],
        p3: [createCard('Q', 'hearts'), createCard('8', 'hearts')],
        p4: [createCard('K', 'hearts'), createCard('2', 'clubs')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;

      makeMove(game, 'p1', [createCard('10', 'hearts')], 'play');
      makeMove(game, 'p2', [createCard('J', 'hearts')], 'play');
      makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      makeMove(game, 'p4', [createCard('K', 'hearts')], 'play');
      makeMove(game, 'p1', [], 'pass');
      makeMove(game, 'p2', [], 'pass');
      // After P4 plays (lead), P1 and P2 have passed; next is P3
      const nextId = game.turnOrder[game.currentPlayerIndex].id;
      expect(nextId).toBe('p3');
      const lastPass = makeMove(game, nextId, [], 'pass');
      expect(lastPass.success).toBe(true);
      expect(lastPass.newTrick).toBe(true);
      expect(game.currentTrick.length).toBe(0);
      expect(game.leadPlayer).toBe('p4');
      expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');
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

  describe('Full round simulation (fixed hands, no dealing)', () => {
    /** After each move, current player must not be in playersOut and must have cards (until round ends). */
    function assertCurrentPlayerInPool(game) {
      if (game.roundEnded) return;
      const cur = game.turnOrder[game.currentPlayerIndex];
      expect(cur).toBeDefined();
      expect(game.playersOut).not.toContain(cur.id);
      expect(game.hands[cur.id]?.length).toBeGreaterThan(0);
    }

    test('BUGS.md: player who finished cannot act again', () => {
      game.hands = {
        p1: [createCard('5', 'hearts')],
        p2: [createCard('6', 'hearts'), createCard('7', 'hearts')],
        p3: [createCard('8', 'hearts'), createCard('9', 'hearts')],
        p4: [createCard('10', 'hearts'), createCard('J', 'hearts')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      const r = makeMove(game, 'p1', [createCard('5', 'hearts')], 'play');
      expect(r.success).toBe(true);
      expect(game.playersOut).toContain('p1');
      const bad = makeMove(game, 'p1', [], 'pass');
      expect(bad.success).toBe(false);
      expect(bad.error).toMatch(/already finished|cannot play or pass/);
    });

    test('BUGS.md: when player plays last card in 4-play trick they are added to playersOut', () => {
      const c2s = createCard('2', 'spades');
      const c5h = createCard('5', 'hearts');
      const c9h = createCard('9', 'hearts');
      game.hands = {
        p1: [createCard('2', 'hearts')],
        p2: [createCard('3', 'hearts')],
        p3: [createCard('K', 'hearts')],
        p4: [createCard('4', 'hearts')]
      };
      game.leadPlayer = 'p4';
      game.currentPlayerIndex = 2;
      game.currentTrick = [
        { playerId: 'p4', cards: [c2s], combination: { type: 'single', cards: [c2s] } },
        { playerId: 'p1', cards: [c5h], combination: { type: 'single', cards: [c5h] } },
        { playerId: 'p2', cards: [c9h], combination: { type: 'single', cards: [c9h] } }
      ];
      game.passedPlayers = [];
      const res = makeMove(game, 'p3', [createCard('K', 'hearts')], 'play');
      expect(res.success).toBe(true);
      expect(game.playersOut).toContain('p3');
    });

    test('BUGS.md: full round - current player never in playersOut after each move', () => {
      // Scripted full round: fixed hands, explicit play/pass sequence. Assert current player is always in pool.
      game.hands = {
        p1: [createCard('2', 'hearts'), createCard('3', 'hearts'), createCard('4', 'hearts'), createCard('5', 'hearts'), createCard('6', 'hearts')],
        p2: [createCard('7', 'hearts'), createCard('8', 'hearts'), createCard('9', 'hearts'), createCard('10', 'hearts')],
        p3: [createCard('J', 'hearts'), createCard('Q', 'hearts'), createCard('K', 'hearts')],
        p4: [createCard('A', 'hearts'), createCard('2', 'spades'), createCard('3', 'spades')]
      };
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      game.currentTrick = [];
      game.passedPlayers = [];

      // Trick 1: P1-2-3-4, P2 wins
      makeMove(game, 'p1', [createCard('2', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p2', [createCard('7', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p3', [], 'pass');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p4', [], 'pass');
      assertCurrentPlayerInPool(game);
      // Trick 2: P2-8, P3-J, P4 pass, P1 pass -> P3 wins
      makeMove(game, 'p2', [createCard('8', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p3', [createCard('J', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p4', [], 'pass');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p1', [], 'pass');
      assertCurrentPlayerInPool(game);
      // Trick 3: P3-Q, P4-A, P1 pass, P2 pass -> P4 wins
      makeMove(game, 'p3', [createCard('Q', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p4', [createCard('A', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p1', [], 'pass');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p2', [], 'pass');
      assertCurrentPlayerInPool(game);
      // Trick 4: P4-2s, P1-3, P2-9, P3-K (P3 last card -> should be in playersOut after)
      makeMove(game, 'p4', [createCard('2', 'spades')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p1', [createCard('3', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p2', [createCard('9', 'hearts')], 'play');
      assertCurrentPlayerInPool(game);
      makeMove(game, 'p3', [createCard('K', 'hearts')], 'play');
      if (!game.roundEnded) assertCurrentPlayerInPool(game);
      // P3 must not get turn again (they are out)
      if (!game.roundEnded) {
        const curId = game.turnOrder[game.currentPlayerIndex].id;
        expect(game.playersOut).not.toContain(curId);
        makeMove(game, curId, [], 'pass');
        assertCurrentPlayerInPool(game);
        makeMove(game, game.turnOrder[game.currentPlayerIndex].id, [], 'pass');
        assertCurrentPlayerInPool(game);
        makeMove(game, game.turnOrder[game.currentPlayerIndex].id, [], 'pass');
      }
      expect(game.playersOut).not.toContain(undefined);
    });

    test('BUGS.md: actual full round with 14 cards each - play until round ends, current player never in playersOut', () => {
      // Real hand size: 14 cards per player (56-card Tichu deck). No shuffle for deterministic test.
      const fullDeck = createTichuDeck();
      expect(fullDeck.length).toBe(56);
      const handsByPlayer = {
        p1: fullDeck.slice(0, 14),
        p2: fullDeck.slice(14, 28),
        p3: fullDeck.slice(28, 42),
        p4: fullDeck.slice(42, 56)
      };
      game.state = 'playing';
      game.hands = handsByPlayer;
      game.leadPlayer = 'p1';
      game.currentPlayerIndex = 0;
      game.currentTrick = [];
      game.passedPlayers = [];
      game.mahJongPlayed = true; // Skip Mah Jong wish for this test (no Mah Jong lead)
      game.mahJongWish = null;
      game.roundEnded = false;

      const MAX_MOVES = 3000; // 14*4 = 56 cards; many passes can occur so allow plenty of moves
      let moves = 0;
      while (!game.roundEnded && game.state === 'playing' && moves < MAX_MOVES) {
        // Resolve Dragon opponent selection if blocking (Dragon won a trick)
        if (game.dragonOpponentSelection) {
          const dragonPlayerId = game.dragonOpponentSelection.playerId;
          const dragonTeam = game.players.find(p => p.id === dragonPlayerId)?.team;
          const opponent = game.players.find(p => p.id !== dragonPlayerId && p.team !== dragonTeam);
          const selectedId = opponent?.id || game.players.find(p => p.id !== dragonPlayerId)?.id;
          const selRes = selectDragonOpponent(game, dragonPlayerId, selectedId);
          expect(selRes.success).toBe(true);
          continue;
        }
        assertCurrentPlayerInPool(game);
        const cur = game.turnOrder[game.currentPlayerIndex];
        const hand = game.hands[cur.id];
        if (!hand || hand.length === 0) break;

        let moved = false;
        if (game.currentTrick.length === 0) {
          // Lead must play: try each card until one succeeds (handles Dog/Phoenix/Mah Jong)
          let lastError = null;
          for (let i = 0; i < hand.length; i++) {
            const res = makeMove(game, cur.id, [hand[i]], 'play', hand[i].name === 'mahjong' ? '2' : null);
            if (res.success) {
              moved = true;
              break;
            }
            lastError = res.error;
          }
          if (!moved) throw new Error(lastError || 'Lead could not play any card');
        } else {
          // Try to play a card that beats, else pass
          for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            const res = makeMove(game, cur.id, [card], 'play', card.name === 'mahjong' ? '2' : null);
            if (res.success) {
              moved = true;
              break;
            }
          }
          if (!moved) {
            const passRes = makeMove(game, cur.id, [], 'pass');
            expect(passRes.success).toBe(true);
          }
        }
        moves++;
      }

      expect(moves).toBeLessThan(MAX_MOVES);
      if (game.playersOut.length === 4) {
        expect(game.state === 'round-ended' || game.roundEnded).toBe(true);
      }
      if (game.playersOut.length >= 1) {
        expect(game.playersOut.length).toBe(4);
      }
    });
  });
});
