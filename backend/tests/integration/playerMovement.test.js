/**
 * Player movement / turn rotation tests with detailed logging.
 *
 * Run with logs (default):
 *   npm test -- --testPathPattern=playerMovement
 *
 * Suppress logs:
 *   LOG_MOVEMENT=0 npm test -- --testPathPattern=playerMovement
 *
 * Logs show at each step: turn order, current turn (index → player), lead player,
 * who is in the trick, who has passed, and current winner (acted-since-lead logic).
 */

const { makeMove } = require('../../game/moveHandler');
const { getCurrentWinningPlay } = require('../../game/trickManager');

function card(rank, suit) {
  return { type: 'standard', rank, suit };
}

function logState(game, label) {
  const turnOrderIds = game.turnOrder.map(p => p.id);
  const currentId = game.turnOrder[game.currentPlayerIndex]?.id ?? '?';
  const inTrick = (game.currentTrick || []).map(p => p.playerId);
  const passed = game.passedPlayers || [];
  const winning = getCurrentWinningPlay(game.currentTrick);
  const winnerId = winning ? winning.playerId : null;

  console.log('');
  console.log(`  --- ${label} ---`);
  console.log(`  Turn order:        [${turnOrderIds.join(', ')}]`);
  console.log(`  Current turn:     index ${game.currentPlayerIndex} → ${currentId}`);
  console.log(`  Lead player:       ${game.leadPlayer} (must play; we end trick when we would return to lead)`);
  console.log(`  In trick:          [${inTrick.join(', ')}]`);
  console.log(`  Passed this trick: [${passed.join(', ')}]`);
  console.log(`  Current winner:    ${winnerId ?? 'none'}`);
  console.log(`  Players out:       [${(game.playersOut || []).join(', ')}]`);
}

describe('Player movement (with logs)', () => {
  let game;
  const log = process.env.LOG_MOVEMENT !== '0';

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
        p1: [card('2', 'hearts'), card('3', 'hearts'), card('4', 'hearts'), card('5', 'hearts'), card('6', 'hearts')],
        p2: [card('7', 'hearts'), card('8', 'hearts'), card('9', 'hearts'), card('10', 'hearts'), card('J', 'hearts')],
        p3: [card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts'), card('2', 'spades'), card('3', 'spades')],
        p4: [card('4', 'spades'), card('5', 'spades'), card('6', 'spades'), card('7', 'spades'), card('8', 'spades')]
      },
      playersOut: [],
      dogPriorityPlayer: null,
      mahJongWish: null,
      mahJongPlayed: true,
      firstCardPlayed: { p1: true, p2: true, p3: true, p4: true },
      playerStacks: { p1: { cards: [], points: 0 }, p2: { cards: [], points: 0 }, p3: { cards: [], points: 0 }, p4: { cards: [], points: 0 } },
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

  test('long trick: current holder is lead; everyone gets one chance to respond then we end when we would return to them', () => {
    if (log) console.log('\n========== P1 leads, P2 plays (now lead), P3 pass, P4 pass → P1 gets turn to respond → P1 pass → end (P2 wins) ==========');

    if (log) logState(game, 'Initial (P1 lead, empty trick)');

    makeMove(game, 'p1', [card('2', 'hearts')], 'play');
    if (log) logState(game, 'After P1 plays 2♥ (lead)');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');
    expect(game.leadPlayer).toBe('p1');

    makeMove(game, 'p2', [card('7', 'hearts')], 'play');
    if (log) logState(game, 'After P2 plays 7♥ (now lead); next = P3');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');
    expect(game.leadPlayer).toBe('p2');

    makeMove(game, 'p3', [], 'pass');
    if (log) logState(game, 'After P3 passes → next = P4');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');

    makeMove(game, 'p4', [], 'pass');
    if (log) logState(game, 'After P4 passes → P1 has not acted since P2 (lead); next = P1');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
    expect(game.currentTrick.length).toBe(2);

    const r5 = makeMove(game, 'p1', [], 'pass');
    expect(r5.success).toBe(true);
    if (log) logState(game, 'After P1 passes → next would be P2 (lead); END trick, P2 wins');
    expect(r5.newTrick).toBe(true);
    expect(game.currentTrick.length).toBe(0);
    expect(game.leadPlayer).toBe('p2');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');
  });

  test('bomb: P1 leads → P2 bombs → P3 pass, P4 pass → P1 must get a turn (acted since lead) → P1 pass → trick ends', () => {
    game.hands = {
      p1: [card('10', 'hearts'), card('J', 'hearts')],
      p2: [card('A', 'hearts'), card('A', 'diamonds'), card('A', 'clubs'), card('A', 'spades'), card('2', 'hearts')],
      p3: [card('K', 'hearts')],
      p4: [card('Q', 'hearts')]
    };

    if (log) console.log('\n========== Bomb scenario: P1 leads, P2 bombs, everyone else must get one chance ==========');

    if (log) logState(game, 'Initial');
    makeMove(game, 'p1', [card('10', 'hearts')], 'play');
    if (log) logState(game, 'After P1 plays 10♥ (lead)');

    const bombResult = makeMove(game, 'p2', [
      card('A', 'hearts'), card('A', 'diamonds'), card('A', 'clubs'), card('A', 'spades')
    ], 'play');
    expect(bombResult.success).toBe(true);
    expect(game.leadPlayer).toBe('p2');
    if (log) logState(game, 'After P2 bombs (lead is now P2; turn order rotated, next = P3)');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');

    makeMove(game, 'p3', [], 'pass');
    if (log) logState(game, 'After P3 passes → next = P4');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');

    makeMove(game, 'p4', [], 'pass');
    if (log) logState(game, 'After P4 passes → next must be P1 (P1 played before bomb, so has NOT acted since lead)');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
    expect(game.currentTrick.length).toBeGreaterThan(0);

    const p1Pass = makeMove(game, 'p1', [], 'pass');
    expect(p1Pass.success).toBe(true);
    expect(p1Pass.newTrick).toBe(true);
    if (log) logState(game, 'After P1 passes → we would return to P2 (lead) → trick ends, P2 wins');
    expect(game.currentTrick.length).toBe(0);
    expect(game.leadPlayer).toBe('p2');
  });

  test('longer trick: multiple plays; after P4 plays, P1/P2/P3 each get a chance to respond before trick ends', () => {
    // One trick: P1, P2, P3 pass, P4 play. Lead = P4 (current holder). P1, P2, P3 must get a turn; then we end when we would return to P4.
    if (log) console.log('\n========== Longer trick: 3 plays; after P4 plays, P1→P2→P3 get a chance, then end ==========');

    if (log) logState(game, 'Initial');
    makeMove(game, 'p1', [card('2', 'hearts')], 'play');
    if (log) logState(game, 'P1 plays 2♥ (lead) → next = P2');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');

    makeMove(game, 'p2', [card('7', 'hearts')], 'play');
    if (log) logState(game, 'P2 plays 7♥ (now lead); next = P3');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');
    expect(game.currentTrick.length).toBe(2);

    makeMove(game, 'p3', [], 'pass');
    if (log) logState(game, 'P3 passes → next = P4');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');

    makeMove(game, 'p4', [card('8', 'spades')], 'play');
    if (log) logState(game, 'P4 plays 8♠ (now lead); P1 has not acted since P4 → next = P1');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p1');
    expect(game.currentTrick.length).toBe(3);

    makeMove(game, 'p1', [], 'pass');
    if (log) logState(game, 'P1 passes → next = P2');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p2');

    makeMove(game, 'p2', [], 'pass');
    if (log) logState(game, 'P2 passes → next = P3');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p3');

    const p3Pass = makeMove(game, 'p3', [], 'pass');
    if (log) logState(game, 'P3 passes → next would be P4 (lead); END trick, P4 wins');
    expect(p3Pass.success).toBe(true);
    expect(p3Pass.newTrick).toBe(true);
    expect(game.currentTrick.length).toBe(0);
    expect(game.leadPlayer).toBe('p4');
    expect(game.turnOrder[game.currentPlayerIndex].id).toBe('p4');
  });

  test('full round of movement: two complete tricks with mixed play/pass', () => {
    if (log) console.log('\n========== Two full tricks with logging ==========');

    // Trick 1: P1 leads 2, P2 plays 7 (lead), P3 pass, P4 pass, P1 pass → P2 wins
    if (log) logState(game, 'Trick 1 start');
    makeMove(game, 'p1', [card('2', 'hearts')], 'play');
    makeMove(game, 'p2', [card('7', 'hearts')], 'play');
    makeMove(game, 'p3', [], 'pass');
    makeMove(game, 'p4', [], 'pass');
    const t1End = makeMove(game, 'p1', [], 'pass');
    expect(t1End.newTrick).toBe(true);
    expect(game.currentTrick.length).toBe(0);
    expect(game.leadPlayer).toBe('p2');
    if (log) logState(game, 'Trick 1 ended, P2 won');

    // Trick 2: P2 leads 8, P3 plays Q (lead), P4 pass, P1 pass, P2 pass → P3 wins
    makeMove(game, 'p2', [card('8', 'hearts')], 'play');
    makeMove(game, 'p3', [card('Q', 'hearts')], 'play');
    makeMove(game, 'p4', [], 'pass');
    makeMove(game, 'p1', [], 'pass');
    const t2End = makeMove(game, 'p2', [], 'pass');
    expect(t2End.newTrick).toBe(true);
    expect(game.leadPlayer).toBe('p3');
    if (log) logState(game, 'Trick 2 ended, P3 won');

    // Trick 3: P3 leads K, P4 plays A (lead); P1 pass, P2 pass, P3 pass → P4 wins
    game.hands.p4 = [card('A', 'spades'), card('5', 'spades'), card('6', 'spades'), card('7', 'spades'), card('8', 'spades')];
    makeMove(game, 'p3', [card('K', 'hearts')], 'play');
    makeMove(game, 'p4', [card('A', 'spades')], 'play');
    makeMove(game, 'p1', [], 'pass');
    makeMove(game, 'p2', [], 'pass');
    const t3End = makeMove(game, 'p3', [], 'pass');
    expect(t3End.newTrick).toBe(true);
    expect(game.leadPlayer).toBe('p4');
    if (log) logState(game, 'Trick 3 ended, P4 won');
    if (log) console.log('');
  });
});
