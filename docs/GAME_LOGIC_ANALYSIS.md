# Game Logic Analysis & Bug Fixes

## Critical Bugs Found

### 1. **Rotation of Play Bug** (BUGS.md line 14)
**Issue**: When player 1 plays a card, if players 2 and 3 pass, player 4 doesn't always get a chance to play.

**Root Cause**: The cycle detection logic in `moveHandler.js` (lines 95-103) only checks if we've cycled back to the lead player, but doesn't properly ensure ALL players after the lead have had a turn.

**Fix**: Improve the cycle detection to count how many players after the lead have acted, rather than just checking if we've wrapped around.

### 2. **Priority After Winning Hand** (BUGS.md line 24)
**Issue**: When player 1 finishes their hand and no one beats it, priority should go to player 2, not player 4.

**Root Cause**: In `trickManager.js` `startNewTrick()`, when the lead player has no cards, it finds the next player with cards, but the turn order might not be set correctly.

**Fix**: Ensure `getNextPlayerWithCards` returns the immediate next player in turn order, not just any player with cards.

### 3. **Dog Priority Not Enforced Properly**
**Issue**: Dog priority player should not be able to pass, but the check might not be comprehensive enough.

**Status**: The check exists in `moveHandler.js` line 40, but we should verify it's working in all cases.

### 4. **Phoenix in Sequence of Pairs**
**Issue**: Phoenix, Q, J, J should form a valid sequence of pairs (J,J,Q,Q with Phoenix).

**Analysis**: The validation logic in `combinations.js` should handle this correctly. Phoenix can substitute for one card in a pair, so J,J,Q,Phoenix should be valid as a sequence of pairs if the ranks are consecutive.

**Status**: Logic appears correct, but needs testing.

## Edge Cases to Verify

1. **Bomb interrupts with players going out**: When a bomb is played and the player goes out, other players should still be able to play higher bombs.

2. **Dragon selection timing**: Ensure Dragon opponent selection doesn't break the game flow.

3. **Mah Jong wish persistence**: Wish should persist across tricks until fulfilled.

4. **All players pass after bomb**: If a bomb is played and all others pass, the bomb player should win the trick.

5. **Double victory edge case**: Ensure double victory is detected correctly when teammates go out 1st and 2nd.

6. **Last place penalty**: Ensure negative points from Phoenix are transferred correctly.

## Bugs Fixed

### 1. **Rotation of Play Bug** ✅ FIXED
- **Fix**: Improved cycle detection to count players after lead who have acted
- **Location**: `moveHandler.js` lines 106-130

### 2. **Priority After Winning Hand** ✅ FIXED  
- **Fix**: Ensured `getNextPlayerWithCards` returns immediate next player in turn order
- **Location**: `trickManager.js` lines 54-63

### 3. **Lead Player Plays Again After All Pass** ✅ FIXED
- **Fix**: Added check to detect when all other players have passed after a play
- **Location**: `moveHandler.js` lines 424-437

### 4. **Priority Enforcement** ✅ VERIFIED
- **Status**: Lead player and Dog priority player cannot pass - checks are in place
- **Location**: `moveHandler.js` lines 35-48

## Potential Issues Remaining

1. **Turn order after bomb**: When a bomb interrupts, the turn order is rotated. This might cause issues with cycle detection.

2. **Pass detection with bombs**: The pass detection logic doesn't account for bombs being played out of turn.

3. **Wish fulfillment timing**: The wish is cleared when any card is played after Mah Jong, but this might be too early in some cases.

4. **Phoenix in sequence of pairs**: The validation logic appears correct, but edge cases like "Phoenix, Q, J, J" need testing to ensure it validates as J,J and Q,Q (Phoenix completes Q pair).
