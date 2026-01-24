/**
 * Integration test for a complete round simulation
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick } = require('../../game/trickManager');
const { handlePlayerWin } = require('../../game/scoring');

describe('Full Round Simulation', () => {
  let game;

  beforeEach(() => {
    game = {
      state: 'playing',
      players: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      turnOrder: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      currentPlayerIndex: 0,
      leadPlayer: 'p1',
      currentTrick: [],
      passedPlayers: [],
      hands: {
        p1: [
          { type: 'standard', rank: 'K', suit: 'hearts' },
          { type: 'standard', rank: '5', suit: 'hearts' } // Point card
        ],
        p2: [
          { type: 'standard', rank: 'A', suit: 'hearts' },
          { type: 'standard', rank: '10', suit: 'hearts' } // Point card
        ],
        p3: [
          { type: 'standard', rank: 'Q', suit: 'hearts' }
        ],
        p4: [
          { type: 'standard', rank: 'J', suit: 'hearts' }
        ]
      },
      playersOut: [],
      dogPriorityPlayer: null,
      mahJongWish: null,
      mahJongPlayed: false,
      firstCardPlayed: {},
      playerStacks: {
        p1: { cards: [], points: 0 },
        p2: { cards: [], points: 0 },
        p3: { cards: [], points: 0 },
        p4: { cards: [], points: 0 }
      },
      trickHistory: [],
      dragonPlayed: null,
      dragonOpponentSelection: null,
      tichuDeclarations: {},
      grandTichuDeclarations: {},
      scores: { team1: 0, team2: 0 },
      roundScores: { team1: 0, team2: 0 },
      roundEnded: false
    };
  });

  test('should complete a full trick with scoring', () => {
    // p1 plays K
    makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
    
    // p2 plays A (beats K)
    makeMove(game, 'p2', [{ type: 'standard', rank: 'A', suit: 'hearts' }], 'play');
    
    // p3 and p4 pass
    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p4', [], 'pass');
    
    // p2 should win the trick
    const trickResult = winTrick(game, 'p2');
    expect(trickResult.success).toBe(true);
    expect(trickResult.winner).toBe('p2');
    
    // Check that cards were added to p2's stack
    expect(game.playerStacks.p2.cards.length).toBe(2); // K and A
    // K is worth 10 points, A is worth 0, so total is 10
    expect(game.playerStacks.p2.points).toBe(10);
  });

  test('should accumulate points correctly across tricks', () => {
    // Trick 1: p1 plays 5 (worth 5 points)
    makeMove(game, 'p1', [{ type: 'standard', rank: '5', suit: 'hearts' }], 'play');
    makeMove(game, 'p2', [], 'pass');
    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p4', [], 'pass');
    winTrick(game, 'p1');
    
    // Trick 2: p1 plays K, p2 plays A (p2 wins)
    makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
    makeMove(game, 'p2', [{ type: 'standard', rank: 'A', suit: 'hearts' }], 'play');
    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p4', [], 'pass');
    winTrick(game, 'p2');
    
    // p2 should have points from both tricks:
    // Trick 1: p1 won with 5 card (5 points) - p1 gets these
    // Trick 2: p2 won with A card, but p1's K (10 points) is in the trick
    // So p2 should have 10 points from the K card
    expect(game.playerStacks.p2.points).toBe(10);
  });

  test('should handle player going out', () => {
    // Give p1 only one card
    game.hands.p1 = [{ type: 'standard', rank: 'K', suit: 'hearts' }];
    
    // p1 plays last card
    const result = makeMove(game, 'p1', [{ type: 'standard', rank: 'K', suit: 'hearts' }], 'play');
    
    expect(result.success).toBe(true);
    expect(result.playerWon).toBe(true);
    expect(game.playersOut).toContain('p1');
    expect(game.hands.p1.length).toBe(0);
  });
});
