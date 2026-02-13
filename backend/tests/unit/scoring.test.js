/**
 * Unit tests for scoring logic
 */

// Mock initializeGame to prevent it from resetting game state in tests
const mockInitializeGame = jest.fn((game) => {
  // Don't reset the game state in tests - just return the game as-is
  // This allows us to check the scoring results
  return game;
});

jest.mock('../../game/initialization', () => ({
  initializeGame: mockInitializeGame
}));

const { handlePlayerWin } = require('../../game/scoring');

describe('Scoring Logic', () => {
  let mockGame;

  beforeEach(() => {
    mockGame = {
      players: [
        { id: 'p1', team: 1, name: 'Player 1' },
        { id: 'p2', team: 1, name: 'Player 2' },
        { id: 'p3', team: 2, name: 'Player 3' },
        { id: 'p4', team: 2, name: 'Player 4' }
      ],
      playersOut: [],
      playerStacks: {
        p1: { cards: [], points: 0 },
        p2: { cards: [], points: 0 },
        p3: { cards: [], points: 0 },
        p4: { cards: [], points: 0 }
      },
      hands: {
        p1: [],
        p2: [],
        p3: [],
        p4: []
      },
      tichuDeclarations: {},
      grandTichuDeclarations: {},
      scores: { team1: 0, team2: 0 },
      roundScores: { team1: 0, team2: 0 },
      roundEnded: false,
      state: 'playing'
    };
  });

  test('should calculate team scores from player stacks', () => {
    mockGame.playerStacks.p1.points = 25;
    mockGame.playerStacks.p2.points = 15;
    mockGame.playerStacks.p3.points = 10;
    mockGame.playerStacks.p4.points = 5;
    
    // Simulate: p1 and p2 are out, p3 goes out leaving only p4 with cards
    mockGame.playersOut = ['p1', 'p2'];
    mockGame.hands.p1 = [];
    mockGame.hands.p2 = [];
    mockGame.hands.p3 = []; // p3 has no cards (going out)
    mockGame.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }]; // p4 still has cards
    
    // p3 goes out - this leaves only p4 with cards, so round should end
    handlePlayerWin(mockGame, 'p3');

    // Last place (p4) points transfer to first place (p1) before team scores are calculated
    // So: p1 gets p4's 5 points (25 + 5 = 30), p4 has 0
    // Team1: 30 + 15 = 45
    // Team2: 10 + 0 = 10
    expect(mockGame.playerStacks.p1.points).toBe(30); // 25 + 5 (from p4)
    expect(mockGame.playerStacks.p4.points).toBe(0); // Last place gets 0
    expect(mockGame.roundScores.team1).toBe(45); // 30 + 15
    expect(mockGame.roundScores.team2).toBe(10); // 10 + 0
  });

  test('should transfer last place points to first place', () => {
    mockGame.playerStacks.p1.points = 50;
    mockGame.playerStacks.p2.points = 30;
    mockGame.playerStacks.p3.points = 20;
    mockGame.playerStacks.p4.points = -25; // Phoenix penalty
    
    // Simulate: p1, p2, p3 are out, p3 goes out leaving only p4 with cards
    mockGame.playersOut = ['p1', 'p2'];
    mockGame.hands.p1 = [];
    mockGame.hands.p2 = [];
    mockGame.hands.p3 = []; // p3 has no cards (going out)
    mockGame.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }]; // p4 still has cards
    
    // p3 goes out - this leaves only p4 with cards, so round should end
    handlePlayerWin(mockGame, 'p3');

    // Last place (p4) points should transfer to first place (p1)
    expect(mockGame.playerStacks.p1.points).toBe(25); // 50 + (-25)
    expect(mockGame.playerStacks.p4.points).toBe(0);
  });

  test('should apply Tichu bonus for successful declaration', () => {
    mockGame.playerStacks.p1.points = 50;
    mockGame.playerStacks.p2.points = 30;
    mockGame.playerStacks.p3.points = 20;
    mockGame.playerStacks.p4.points = 10;
    mockGame.playersOut = ['p1', 'p2'];
    mockGame.hands.p1 = [];
    mockGame.hands.p2 = [];
    mockGame.hands.p3 = []; // p3 has no cards (going out)
    mockGame.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }]; // p4 still has cards
    mockGame.tichuDeclarations = { p1: true };
    
    // p3 goes out - this leaves only p4 with cards, so round should end
    handlePlayerWin(mockGame, 'p3');

    // Last place (p4) points transfer to first place (p1) before team scores
    // p1: 50 + 10 (from p4) = 60
    // Team1: 60 + 30 = 90, + 100 Tichu bonus = 190
    expect(mockGame.roundScores.team1).toBe(190); // (60+30) + 100 Tichu bonus
  });

  test('should apply Tichu penalty when declarer does not get first', () => {
    // p4 declares Tichu but gets last (not first) → -100 to their team (BUGS.md: can get negative points)
    mockGame.playerStacks.p1.points = 50;
    mockGame.playerStacks.p2.points = 30;
    mockGame.playerStacks.p3.points = 20;
    mockGame.playerStacks.p4.points = 10;
    mockGame.playersOut = ['p1', 'p2', 'p3'];
    mockGame.hands.p1 = [];
    mockGame.hands.p2 = [];
    mockGame.hands.p3 = [];
    mockGame.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }];
    mockGame.tichuDeclarations = { p4: true };

    handlePlayerWin(mockGame, 'p3');

    // First place is p1; p4 declared Tichu but got last → -100 penalty
    // Team2 stack: 20 + 0 (p4's points transferred to p1) = 20; then -100 = -80
    expect(mockGame.roundScores.team2).toBe(-80);
  });


  test('should handle double victory correctly', () => {
    mockGame.playersOut = ['p1']; // p1 finished first
    mockGame.playerStacks.p1.points = 50;
    mockGame.playerStacks.p2.points = 30;
    mockGame.playerStacks.p3.points = 20;
    mockGame.playerStacks.p4.points = 10;

    // p2 goes out second (same team as p1) - this should trigger double victory
    handlePlayerWin(mockGame, 'p2');

    expect(mockGame.roundScores.team1).toBe(200); // Double victory base
    expect(mockGame.roundScores.team2).toBe(0);
    expect(mockGame.roundEnded).toBe(true);
  });
});
