# Bug Report and Solutions

## ✅ Bugs Already Fixed (Verified in Code)

The following bugs from BUGS.md have been verified as fixed in the codebase:

1. **Lead player plays again after all pass** (BUGS.md line 1) - ✅ FIXED
   - Location: `backend/game/moveHandler.js` lines 442-458
   - Code handles case where all other players pass after a play

2. **Rotation of Play Bug** (BUGS.md line 14) - ✅ FIXED
   - Location: `backend/game/moveHandler.js` lines 103-130
   - Improved cycle detection ensures all players after lead get a turn

3. **Priority After Winning Hand** (BUGS.md line 24) - ✅ FIXED
   - Location: `backend/game/trickManager.js` line 56
   - Uses `getNextPlayerWithCards()` to find immediate next player in turn order

4. **Priority Enforcement** (BUGS.md line 27) - ✅ FIXED
   - Location: `backend/game/moveHandler.js` lines 36-44
   - Lead player and Dog priority player cannot pass

5. **Winner Gets Priority** (BUGS.md line 30) - ✅ FIXED
   - Location: `backend/game/trickManager.js` line 141
   - Winner is set as lead player and gets priority

---

## Critical Bugs Still Needing Investigation

### 1. **Dog Priority Not Working Properly** ⚠️ HIGH PRIORITY
**Location**: `backend/game/specialCards.js`  
**Issue**: BUGS.md line 20 states "Still not working, dog is not giving priority to a teammate even if they have cards."

**Analysis**:
- The code logic in `specialCards.js` appears correct
- Partner lookup uses `game.players.find(p => p.team === player.team && p.id !== playerId)`
- However, there may be an issue with how the priority is being cleared or checked

**Potential Issues**:
1. The `dogPriorityPlayer` might be getting cleared too early
2. The partner lookup might fail if teams aren't properly initialized
3. The priority check in `moveHandler.js` might not be working correctly

**Solution**:
- Add debug logging to verify partner lookup is working
- Ensure `dogPriorityPlayer` is only cleared when the priority player actually plays a card
- Verify teams are properly set before Dog is played

**Code to Check**:
```javascript
// In specialCards.js, add logging:
console.log('Dog played by:', playerId, 'Team:', player.team);
console.log('Partner found:', partner?.id, 'Has cards:', partnerHasCards, 'Gone out:', partnerHasGoneOut);
console.log('Next lead player set to:', nextLeadPlayer?.id);
```

---

### 2. **Phoenix in Sequence of Pairs Validation** ⚠️ MEDIUM PRIORITY (Needs Testing)
**Location**: `backend/game/combinations.js` - `validateSequenceOfPairs()`  
**Issue**: BUGS.md line 33 - User tried to play "Phoenix, Q, J, J" which should be a valid sequence of pairs (J,J and Q,Q with Phoenix completing Q pair).

**Analysis**:
- Input: Phoenix, Q, J, J
- Expected: J,J (complete pair) + Q,Q (Q + Phoenix)
- The validation logic should handle this:
  - J: 2 cards → complete pair ✓
  - Q: 1 card → needs Phoenix ✓
  - Phoenix: 1 card ✓
  - ranksNeedingPhoenix = 1, phoenixCount = 1 ✓
  - Consecutive ranks (J=11, Q=12) ✓

**Potential Issue**:
The validation might be failing because:
1. The rank grouping might not be handling Phoenix correctly
2. The consecutive check might be failing
3. The card order might matter

**Solution**:
Test with: `validateSequenceOfPairs([{rank: 'J'}, {rank: 'J'}, {rank: 'Q'}, {name: 'phoenix'}])`

**Status**:
The validation logic in `combinations.js` (lines 108-217) appears comprehensive and should handle this case correctly:
- Groups cards by rank, handling Phoenix separately
- Checks that Phoenix count matches ranks needing completion
- Verifies consecutive sequence
- Should validate "Phoenix, Q, J, J" as J,J + Q,Q (Phoenix completes Q pair)

**Action Needed**: Test with actual game input to verify it works correctly. The code logic looks correct but needs real-world testing.

---

### 3. **Scoring Calculation Issues** ⚠️ HIGH PRIORITY
**Location**: `backend/game/scoring.js`  
**Issue**: BUGS.md line 3 - "Current calculations are off (not adding score correctly)"

**Analysis**:
- The scoring logic in `scoring.js` appears comprehensive and correct
- Points are accumulated in `playerStacks` when tricks are won (trickManager.js lines 126-127)
- Last place penalty transfers all points to first place (scoring.js lines 116-128)
- Tichu bonuses/penalties are applied correctly (scoring.js lines 140-157)
- Team scores are calculated from player stacks (scoring.js lines 131-138)
- Total scores are updated correctly (scoring.js lines 159-161)

**Potential Issues** (needs investigation):
1. Points might not be calculated correctly for special cards (Dragon, Phoenix)
2. There might be a timing issue where scores are calculated before all tricks are complete
3. Double victory scoring might have edge cases
4. The issue might be in how points are displayed on the frontend, not the backend calculation

**Solution**:
- Add detailed logging throughout the scoring process
- Verify points are correctly added to `playerStacks` in `trickManager.js`
- Ensure last place penalty transfers ALL points (including negative from Phoenix)
- Verify Tichu bonuses are only applied to the correct team
- Check that `game.scores.team1` and `game.scores.team2` are updated correctly

**Code to Add**:
```javascript
// In scoring.js, add logging:
console.log('Scoring calculation:', {
  playerStacks: Object.entries(game.playerStacks).map(([id, stack]) => ({
    playerId: id,
    points: stack.points
  })),
  roundScores: game.roundScores,
  totalScores: game.scores
});
```

---

### 4. **Mah Jong Rules Buggy** ⚠️ HIGH PRIORITY
**Location**: `backend/game/moveHandler.js`  
**Issue**: BUGS.md line 7 - "mah Jong rules need to be fixed, very buggy currently"

**Analysis**:
- Mah Jong wish logic is complex and has multiple edge cases
- The wish should persist until the wished card is played
- Wish fulfillment logic might be clearing the wish too early or too late

**Potential Issues**:
1. Wish might be cleared when it shouldn't be
2. Wish might persist when it should be cleared
3. Wish enforcement might not work correctly for all players
4. Mah Jong in a straight might not clear the wish correctly

**Solution**:
- Review the wish clearing logic (lines 396-422 in moveHandler.js)
- Ensure wish is only cleared when:
  - The exact wished card is played as a single, OR
  - Any card is played after Mah Jong (as a single) - this seems incorrect per rules
- Verify wish enforcement works for all players in turn order
- Test edge cases: Mah Jong in straight, wish with multiple players, etc.

**Recommended Fix**:
According to Tichu rules, the wish should persist until the exact wished card is played. The current logic clears it when "any card is played after Mah Jong" which might be incorrect.

---

## Minor Issues / Edge Cases

### 7. **Bomb Interrupt with Players Going Out**
**Location**: `backend/game/moveHandler.js`  
**Issue**: When a bomb is played and the player goes out, other players should still be able to play higher bombs.

**Status**: Code appears to handle this (lines 244-255), but needs testing.

---

### 6. **Dragon Selection Timing**
**Location**: `backend/game/trickManager.js`  
**Issue**: Ensure Dragon opponent selection doesn't break the game flow.

**Status**: Code appears to handle this, but needs verification.

---

### 9. **Wish Persistence Across Tricks**
**Location**: `backend/game/moveHandler.js`  
**Issue**: Wish should persist across tricks until fulfilled.

**Status**: Code comment says it persists (line 80 in trickManager.js), but needs testing.

---

## Recommended Testing Strategy

1. **Dog Priority Test**:
   - Play Dog as lead card
   - Verify partner gets priority
   - Verify partner cannot pass
   - Verify partner can play any combination (not just singles)
   - Test when partner has gone out

2. **Phoenix Sequence of Pairs Test**:
   - Test: Phoenix, Q, J, J
   - Test: Phoenix, J, J, Q
   - Test: J, J, Phoenix, Q
   - Verify all are valid

3. **Scoring Test**:
   - Play a full round
   - Verify points are calculated correctly
   - Verify last place penalty transfers correctly
   - Verify Tichu bonuses are applied correctly

5. **Mah Jong Wish Test**:
   - Play Mah Jong with wish
   - Verify wish persists across tricks
   - Verify wish is cleared when exact card is played
   - Test with Mah Jong in straight

---

## Priority Order for Fixes

1. **HIGH**: Dog Priority (#1), Scoring (#3), Mah Jong (#4)
2. **MEDIUM**: Phoenix Sequence (#2) - needs testing to confirm
3. **LOW**: Edge cases (#5-7) - code appears correct, needs verification

---

## Next Steps

1. Add comprehensive logging to identify exact failure points
2. Create test cases for each bug
3. Fix bugs in priority order
4. Verify fixes with manual testing
5. Update BUGS.md to mark fixed issues
