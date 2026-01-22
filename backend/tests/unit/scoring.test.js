/**
 * Unit tests for scoring logic
 */

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

    expect(mockGame.roundScores.team1).toBe(40); // 25 + 15
    expect(mockGame.roundScores.team2).toBe(15); // 10 + 5
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

    expect(mockGame.roundScores.team1).toBe(180); // (50+30) + 100 Tichu bonus
  });

  test('should apply Tichu penalty for failed declaration', () => {
    mockGame.playerStacks.p1.points = 50;
    mockGame.playerStacks.p2.points = 30;
    mockGame.playerStacks.p3.points = 20;
    mockGame.playerStacks.p4.points = 10;
    mockGame.playersOut = ['p1', 'p2'];
    mockGame.hands.p1 = [];
    mockGame.hands.p2 = [];
    mockGame.hands.p3 = []; // p3 has no cards (going out)
    mockGame.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }]; // p4 still has cards
    mockGame.tichuDeclarations = { p4: true }; // p4 declared but didn't finish
    
    // p3 goes out - this leaves only p4 with cards, so round should end
    handlePlayerWin(mockGame, 'p3');

    expect(mockGame.roundScores.team2).toBe(-70); // 20 + 10 - 100 Tichu penalty
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
