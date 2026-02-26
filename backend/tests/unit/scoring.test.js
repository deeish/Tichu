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

const { handlePlayerWin, buildRoundLogEntry, appendRoundToLog } = require('../../game/scoring');

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
      state: 'playing',
      playerStats: {
        p1: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
        p2: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
        p3: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
        p4: { dog: 0, phoenix: 0, dragon: 0, mahJong: 0, bombs: 0, points: 0, firstPlace: 0, lastPlace: 0, tichuCalls: 0, tichuWins: 0, grandCalls: 0, grandWins: 0 },
      }
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

    // playerStats: points (contributed to team), first place, last place
    expect(mockGame.playerStats.p1.points).toBe(30); // p1's final stack points
    expect(mockGame.playerStats.p4.points).toBe(0);
    expect(mockGame.playerStats.p1.firstPlace).toBe(1); // p1 was first out
    expect(mockGame.playerStats.p4.lastPlace).toBe(1); // p4 was last (tailender)
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

  describe('playerStats: points (team), first place, last place', () => {
    function triggerTailenderRoundEnd(game) {
      game.playerStacks.p1.points = 25;
      game.playerStacks.p2.points = 15;
      game.playerStacks.p3.points = 10;
      game.playerStacks.p4.points = 5;
      game.playersOut = ['p1', 'p2'];
      game.hands.p1 = [];
      game.hands.p2 = [];
      game.hands.p3 = [];
      game.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }];
      handlePlayerWin(game, 'p3');
    }

    test('should add each player\'s final stack points to playerStats.points when round ends', () => {
      triggerTailenderRoundEnd(mockGame);
      // After last-place transfer: p1 has 25+5=30, p4 has 0; p2 and p3 unchanged
      expect(mockGame.playerStats.p1.points).toBe(30);
      expect(mockGame.playerStats.p2.points).toBe(15);
      expect(mockGame.playerStats.p3.points).toBe(10);
      expect(mockGame.playerStats.p4.points).toBe(0);
    });

    test('should increment playerStats.firstPlace for the player who went out first when round ends', () => {
      triggerTailenderRoundEnd(mockGame);
      expect(mockGame.playerStats.p1.firstPlace).toBe(1);
      expect(mockGame.playerStats.p2.firstPlace).toBe(0);
      expect(mockGame.playerStats.p3.firstPlace).toBe(0);
      expect(mockGame.playerStats.p4.firstPlace).toBe(0);
    });

    test('should increment playerStats.lastPlace for the tailender when round ends', () => {
      triggerTailenderRoundEnd(mockGame);
      expect(mockGame.playerStats.p1.lastPlace).toBe(0);
      expect(mockGame.playerStats.p2.lastPlace).toBe(0);
      expect(mockGame.playerStats.p3.lastPlace).toBe(0);
      expect(mockGame.playerStats.p4.lastPlace).toBe(1);
    });

    test('should record Tichu and Grand calls and wins when round ends', () => {
      mockGame.tichuDeclarations = { p1: true, p3: true }; // p1 and p3 declared Tichu
      mockGame.grandTichuDeclarations = { p2: true };     // p2 declared Grand
      triggerTailenderRoundEnd(mockGame);
      // First place = p1 (went out first), so Tichu win for p1 only; Grand declarer p2 did not get first
      expect(mockGame.playerStats.p1.tichuCalls).toBe(1);
      expect(mockGame.playerStats.p1.tichuWins).toBe(1);
      expect(mockGame.playerStats.p3.tichuCalls).toBe(1);
      expect(mockGame.playerStats.p3.tichuWins).toBe(0);
      expect(mockGame.playerStats.p2.grandCalls).toBe(1);
      expect(mockGame.playerStats.p2.grandWins).toBe(0);
    });
  });

  describe('round log', () => {
    test('appendRoundToLog is called when round ends and populates game.roundLog', () => {
      mockGame.playerStacks.p1.points = 25;
      mockGame.playerStacks.p2.points = 15;
      mockGame.playerStacks.p3.points = 10;
      mockGame.playerStacks.p4.points = 5;
      mockGame.playersOut = ['p1', 'p2'];
      mockGame.hands.p1 = [];
      mockGame.hands.p2 = [];
      mockGame.hands.p3 = [];
      mockGame.hands.p4 = [{ type: 'standard', rank: '2', suit: 'hearts' }];
      handlePlayerWin(mockGame, 'p3');

      expect(mockGame.roundLog).toBeDefined();
      expect(Array.isArray(mockGame.roundLog)).toBe(true);
      expect(mockGame.roundLog.length).toBe(1);
      const entry = mockGame.roundLog[0];
      expect(entry.round).toBe(1);
      expect(entry.players.length).toBe(4);
      entry.players.forEach((p) => {
        expect(p).toHaveProperty('playerId');
        expect(p).toHaveProperty('playerName');
        expect(p).toHaveProperty('team');
        expect(p).toHaveProperty('breakdown');
        expect(p).toHaveProperty('tichu');
        expect(p).toHaveProperty('grandTichu');
        expect(p).toHaveProperty('total');
      });
      // After last-place transfer: p1 has 30, p4 has 0
      const p1Entry = entry.players.find((p) => p.playerId === 'p1');
      const p4Entry = entry.players.find((p) => p.playerId === 'p4');
      expect(p1Entry.total).toBe(30);
      expect(p4Entry.total).toBe(0);
    });

    test('buildRoundLogEntry returns null when playersOut length is not 4', () => {
      mockGame.playersOut = ['p1', 'p2'];
      expect(buildRoundLogEntry(mockGame)).toBeNull();
      mockGame.playersOut = [];
      expect(buildRoundLogEntry(mockGame)).toBeNull();
    });

    test('buildRoundLogEntry builds breakdown from stack cards and applies Tichu/Grand', () => {
      mockGame.playersOut = ['p1', 'p2', 'p3', 'p4'];
      mockGame.playerStacks.p1.cards = [
        { type: 'standard', rank: '5', suit: 'hearts' },
        { type: 'standard', rank: '5', suit: 'spades' },
        { type: 'standard', rank: 'K', suit: 'clubs' }
      ];
      mockGame.playerStacks.p1.points = 20; // 5+5+10
      mockGame.playerStacks.p2.cards = [];
      mockGame.playerStacks.p2.points = 0;
      mockGame.playerStacks.p3.cards = [{ type: 'special', name: 'dragon' }];
      mockGame.playerStacks.p3.points = 25;
      mockGame.playerStacks.p4.cards = [{ type: 'special', name: 'phoenix' }];
      mockGame.playerStacks.p4.points = -25;
      mockGame.tichuDeclarations = { p1: true };
      mockGame.grandTichuDeclarations = { p4: true };

      const entry = buildRoundLogEntry(mockGame);
      expect(entry).not.toBeNull();
      expect(entry.round).toBe(1);
      const p1 = entry.players.find((p) => p.playerId === 'p1');
      const p3 = entry.players.find((p) => p.playerId === 'p3');
      const p4 = entry.players.find((p) => p.playerId === 'p4');

      expect(p1.breakdown).toEqual(expect.arrayContaining([{ label: '2×5', points: 10 }, { label: '1×K', points: 10 }]));
      expect(p1.tichu).toBe(100);
      expect(p1.grandTichu).toBeNull();
      expect(p1.total).toBe(120); // 20 + 100

      expect(p3.breakdown).toEqual([{ label: '1×Dragon', points: 25 }]);
      expect(p3.tichu).toBeNull();
      expect(p3.grandTichu).toBeNull();
      expect(p3.total).toBe(25);

      expect(p4.breakdown).toEqual([{ label: '1×Phoenix', points: -25 }]);
      expect(p4.tichu).toBeNull();
      expect(p4.grandTichu).toBe(-200);
      expect(p4.total).toBe(-225);
    });

    test('appendRoundToLog creates roundLog array if missing', () => {
      expect(mockGame.roundLog).toBeUndefined();
      mockGame.playersOut = ['p1', 'p2', 'p3', 'p4'];
      appendRoundToLog(mockGame);
      expect(mockGame.roundLog).toBeDefined();
      expect(mockGame.roundLog.length).toBe(1);
    });
  });
});
