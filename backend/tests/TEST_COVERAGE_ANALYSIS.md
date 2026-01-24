# Test Coverage Analysis

## Current Test Coverage

### ✅ Well Tested
- **combinations.js** - Basic validation (singles, pairs, sequences, straights, bombs)
- **scoring.js** - Team scores, last place penalty, Tichu bonuses/penalties, double victory
- **gameFlow (integration)** - Dog priority, Mah Jong wish, rotation, priority after win

### ⚠️ Partially Tested
- **moveHandler.js** - Some flows tested, but missing:
  - Bomb interrupts
  - Player going out mid-trick
  - All players pass scenarios
  - Turn validation edge cases
- **trickManager.js** - Basic flows, but missing:
  - Dragon opponent selection
  - Trick winning edge cases
  - Bomb in trick scenarios
- **specialCards.js** - Dog tested, but missing:
  - Dragon logic
  - Phoenix edge cases
  - Mah Jong in straights

### ❌ Not Tested
- **deck.js** - No tests
  - Deck creation
  - Shuffling
  - Card dealing
  - Card value/point calculations
- **declarations.js** - No tests
  - Grand Tichu declaration
  - Tichu declaration
  - Card revelation
- **exchange.js** - No tests
  - Card exchange logic
  - Exchange recipients
  - Exchange completion
- **turnManagement.js** - No tests
  - Turn advancement
  - Finding next player
- **initialization.js** - No tests
  - Game initialization
  - Mah Jong player finding
- **playerView.js** - No tests
  - Player view filtering

## Missing Test Scenarios

### Combinations
- [ ] Triples validation
- [ ] Full house validation
- [ ] Straight flush validation
- [ ] Phoenix in triples
- [ ] Phoenix in full house
- [ ] Phoenix in straights (edge cases)
- [ ] Phoenix value calculation edge cases
- [ ] Comparison edge cases (same rank, etc.)
- [ ] Invalid combinations (3 of a kind in sequence of pairs, etc.)

### Special Cards
- [ ] Dragon played and won
- [ ] Dragon played but beaten by bomb
- [ ] Dragon opponent selection
- [ ] Phoenix as single (all scenarios)
- [ ] Phoenix in pairs (all scenarios)
- [ ] Phoenix in sequences (all scenarios)
- [ ] Mah Jong in straight (no wish)
- [ ] Dog when partner has gone out

### Game Flows
- [ ] Bomb interrupts normal play
- [ ] Bomb interrupts with player going out
- [ ] Multiple bombs in same trick
- [ ] Player goes out mid-trick
- [ ] All players pass after play
- [ ] All players pass after bomb
- [ ] Turn order rotation after bomb
- [ ] Complete round simulation
- [ ] Multiple rounds

### Exchange Phase
- [ ] Exchange recipients calculation
- [ ] Card exchange validation
- [ ] Exchange completion
- [ ] Mah Jong transfer during exchange

### Declarations
- [ ] Grand Tichu declaration
- [ ] Tichu declaration timing
- [ ] Failed Tichu (player doesn't finish)
- [ ] Successful Tichu (player finishes)
- [ ] Card revelation

### Turn Management
- [ ] Turn advancement skips passed players
- [ ] Turn advancement skips players who went out
- [ ] Finding next player with cards
- [ ] Edge cases (all players passed, etc.)

### Scoring Edge Cases
- [ ] Phoenix negative points
- [ ] Dragon positive points
- [ ] Point cards (5, 10, K)
- [ ] Multiple Tichu declarations
- [ ] Grand Tichu bonuses
- [ ] Round ending scenarios

## Recommended Test Files to Add

1. `tests/unit/deck.test.js` - Deck creation, shuffling, dealing
2. `tests/unit/declarations.test.js` - Tichu/Grand Tichu declarations
3. `tests/unit/exchange.test.js` - Card exchange logic
4. `tests/unit/turnManagement.test.js` - Turn advancement
5. `tests/unit/specialCards.test.js` - All special card scenarios
6. `tests/unit/trickManager.test.js` - Trick winning logic
7. `tests/integration/bombs.test.js` - Bomb interrupt scenarios
8. `tests/integration/dragon.test.js` - Dragon scenarios
9. `tests/integration/fullRound.test.js` - Complete round simulation
10. `tests/integration/combinations.test.js` - More combination edge cases

## Priority Order

1. **HIGH** - Critical game logic:
   - Bomb interrupts
   - Dragon selection
   - Exchange logic
   - Turn management

2. **MEDIUM** - Important features:
   - Declarations
   - More combination edge cases
   - Special card edge cases

3. **LOW** - Nice to have:
   - Deck shuffling tests
   - Player view tests
   - Initialization tests
