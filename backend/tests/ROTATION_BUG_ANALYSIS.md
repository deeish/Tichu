# Rotation Bug Analysis

## Problem
Players are not always getting a chance to play after a card has been played. The comprehensive tests reveal that in many scenarios, P4 (or the last player) is not getting a turn.

## Test Results
- **Total Tests**: 25 comprehensive rotation tests
- **Passing**: 9 tests
- **Failing**: 16 tests

### Failing Scenarios
1. P1 plays, P2 beats, P3 passes → P4 should get turn (FAILS)
2. P1 plays, P2 beats, P3 beats → P4 should get turn (FAILS)
3. P1 plays pair, P2 beats, P3 passes → P4 should get turn (FAILS)
4. P1 plays straight, P2 beats, P3 passes → P4 should get turn (FAILS)
5. Bomb interrupt scenarios (FAILS)
6. Player going out scenarios (FAILS)
7. Dog priority scenarios (FAILS)
8. Multiple play scenarios (FAILS)

### Passing Scenarios
1. P1 plays, P2 passes, P3 passes → P4 gets turn (PASSES)
2. P1 plays, P2 passes, P3 beats → P4 gets turn (PASSES)
3. All players pass → P1 wins (PASSES)

## Root Cause Analysis

The issue is in the **pass handler** (`moveHandler.js` lines 66-146). The cycle detection logic is ending the trick before all players have gotten a turn.

### Current Logic Flow (BROKEN)

1. **When a player passes:**
   - Player is added to `passedPlayers`
   - `advanceTurn()` is called
   - Cycle detection checks if all players have acted
   - If `allPlayersHaveActed` OR `cycledBackToLead` is true, trick ends

2. **The Problem:**
   - `advanceTurn()` skips players who have passed
   - When P3 passes, `advanceTurn()` might skip P4 if P4 has somehow been marked as passed
   - OR the cycle detection thinks we've wrapped around when we haven't
   - The trick ends before P4 gets a turn

### Specific Issue

When P2 plays (beats P1):
- `passedPlayers` is cleared (line 461)
- `advanceTurn()` is called, goes to P3
- When P3 passes:
  - P3 is added to `passedPlayers`
  - `advanceTurn()` is called
  - Should go to P4, but instead goes to P2 or wraps around
  - Trick ends before P4 gets a turn

## Proposed Fix

The fix needs to ensure that **every player in turn order after the lead gets a turn** before the trick can end. The current logic checks if all players have acted, but doesn't verify that we've actually cycled through all of them.

### Fix Strategy

1. **Track which players have gotten a turn** (not just who has acted)
2. **Only end trick when:**
   - All players after lead have gotten a turn AND
   - All players have either passed or played AND
   - We've wrapped around to the lead player

3. **Fix `advanceTurn` in pass handler:**
   - Don't skip players who have passed (they already got their turn)
   - Only skip players who have gone out or have no cards
   - Find the next player who hasn't acted yet

## Test File Location
`/Users/dylansalmo/Desktop/Tichu/backend/tests/integration/rotationComprehensive.test.js`

This file contains 25 comprehensive tests covering all variations of:
- Single cards
- Pairs
- Straights
- Bombs
- Players going out
- Dog priority
- All pass scenarios
- Edge cases

## Next Steps

1. Fix the pass handler logic to ensure all players get a turn
2. Fix the cycle detection to only end trick when truly cycled
3. Run comprehensive tests to verify fix
4. Update BUGS.md when fixed
