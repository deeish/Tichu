/**
 * Integration tests for Dragon special card
 */

const { makeMove } = require('../../game/moveHandler');
const { winTrick, selectDragonOpponent } = require('../../game/trickManager');

describe('Dragon Special Card', () => {
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
          { type: 'special', name: 'dragon' },
          { type: 'standard', rank: 'K', suit: 'hearts' }
        ],
        p2: [
          { type: 'standard', rank: 'A', suit: 'hearts' }
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
      dragonOpponentSelection: null
    };
  });

  test('should track Dragon when played as single', () => {
    const result = makeMove(game, 'p1', [{ type: 'special', name: 'dragon' }], 'play');
    
    expect(result.success).toBe(true);
    expect(game.dragonPlayed).toEqual({ playerId: 'p1', trickIndex: 0 });
  });

  test('should require opponent selection when Dragon wins trick', () => {
    // p1 plays Dragon
    makeMove(game, 'p1', [{ type: 'special', name: 'dragon' }], 'play');
    
    // Others pass
    makeMove(game, 'p2', [], 'pass');
    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p4', [], 'pass');
    
    // Dragon wins - should require opponent selection
    const trickResult = winTrick(game, 'p1');
    
    expect(trickResult.dragonOpponentSelection).toBe(true);
    expect(game.dragonOpponentSelection).not.toBe(null);
    expect(game.dragonOpponentSelection.playerId).toBe('p1');
  });

  test('should allow Dragon player to select opponent', () => {
    // Set up Dragon win scenario
    game.currentTrick = [
      { playerId: 'p1', cards: [{ type: 'special', name: 'dragon' }], combination: { type: 'single' } }
    ];
    game.dragonPlayed = { playerId: 'p1', trickIndex: 0 };
    
    winTrick(game, 'p1');
    
    // p1 selects p3 (opponent) to receive the trick
    const result = selectDragonOpponent(game, 'p1', 'p3');
    
    expect(result.success).toBe(true);
    expect(game.dragonOpponentSelection).toBe(null); // Cleared
    expect(game.playerStacks.p3.points).toBe(25); // Dragon is worth 25 points
  });

  test('should reject selecting teammate as opponent', () => {
    game.currentTrick = [
      { playerId: 'p1', cards: [{ type: 'special', name: 'dragon' }], combination: { type: 'single' } }
    ];
    game.dragonPlayed = { playerId: 'p1', trickIndex: 0 };
    winTrick(game, 'p1');
    
    // p1 tries to select p2 (teammate) - should fail
    const result = selectDragonOpponent(game, 'p1', 'p2');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('opponent');
  });

  test('should allow bomb to beat Dragon', () => {
    // p1 plays Dragon
    makeMove(game, 'p1', [{ type: 'special', name: 'dragon' }], 'play');
    
    // Give p3 a bomb
    game.hands.p3 = [
      { type: 'standard', rank: 'A', suit: 'hearts' },
      { type: 'standard', rank: 'A', suit: 'diamonds' },
      { type: 'standard', rank: 'A', suit: 'clubs' },
      { type: 'standard', rank: 'A', suit: 'spades' }
    ];
    
    // p3 plays bomb to beat Dragon
    const bombResult = makeMove(game, 'p3', [
      { type: 'standard', rank: 'A', suit: 'hearts' },
      { type: 'standard', rank: 'A', suit: 'diamonds' },
      { type: 'standard', rank: 'A', suit: 'clubs' },
      { type: 'standard', rank: 'A', suit: 'spades' }
    ], 'play');
    
    expect(bombResult.success).toBe(true);
    // If bomb wins, Dragon selection shouldn't be required
    // (bomb player gets the trick normally)
  });
});
