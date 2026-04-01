# Trick Pass Resolution Plan (Lead asked to beat own card)

## Problem

Players report an intermittent gameplay bug:

- A player leads a card.
- The other 3 players pass.
- Instead of auto-winning the trick, the lead player sometimes gets the turn again with a non-empty trick and is effectively asked to "beat their own card."

This should never happen. After all eligible opponents pass, the trick must resolve immediately to the current winning play and a new trick must start.

## What I found in current code

The issue likely comes from state-resolution complexity in `backend/game/moveHandler.js`, especially in the `action === 'pass'` flow:

- There are multiple, partially duplicated turn-resolution paths (play path, pass path, bomb path, player-went-out path), each with custom wrap logic.
- The pass path computes `allPlayersHaveActed` but does not use it to decide trick resolution.
- `passedPlayers` is an array and is appended without dedupe; repeated/retried actions can make pass accounting noisier than needed.
- Player id comparisons are normalized in some places (`isPlayerOut`) but not consistently for pass/acted checks (`includes`, `some`, trick player comparisons).
- Trick-end decisions rely on index-wrapping heuristics (`nextPlayerIndex === leadPlayerIndex`) plus special-case guards; this increases chance of edge misses under rare sequences.

None of these alone guarantees the bug, but together they create a brittle path where turn assignment can advance back to lead without actually calling `winTrick()`.

## Fix strategy (before coding)

### 1) Create a single trick-resolution helper

Add one shared helper used by pass/play/bomb branches, e.g.:

- `resolveTrickOrNextTurn(game, { actorId, reason })`

It should:

- Build an `eligibleResponders` set: active players with cards, excluding current lead.
- Build an `actedResponders` set: responders who either passed or played since current lead.
- If `actedResponders` covers all `eligibleResponders`, call `winTrick()` immediately.
- Otherwise assign `currentPlayerIndex` to the next unacted eligible responder.

This replaces branch-specific wrap logic and makes the rule explicit.

### 2) Canonicalize ids for all trick accounting

Normalize ids to string for:

- `passedPlayers` writes/reads
- `currentTrick[].playerId` comparisons
- `leadPlayer`, `currentPlayerIndex` lookups

Goal: remove silent mismatches when id types differ.

### 3) Use sets for pass/acted state

Internally use `Set` semantics for pass/acted evaluation (can still serialize arrays in game state if desired).

Goal: repeated/retried pass events cannot distort "who has acted."

### 4) Add invariant guard after each successful move

After move resolution (debug + optional hard-fail in tests):

- If trick is non-empty and `currentPlayer` is lead, then either:
  - trick should have been won already, or
  - there exists at least one eligible responder who has not acted yet.

If not, log and force trick resolution to avoid stuck rounds in production.

### 5) Strengthen socket-level safety

In `make-move` handler:

- Keep action dedupe, but add richer debug logs for pass resolution (lead id, next id, eligible/acted sets, trick length, passed set).
- Ensure duplicate/retry patterns are visible with `requestId/actionId` correlation.

## Test plan to prevent regressions

Add targeted tests (unit + integration):

1. **Core repro**: lead plays single, other three pass -> trick auto-wins, new trick starts, lead now starts a fresh trick (not asked to beat own card).
2. **Flaky stress**: run same scenario repeatedly (100-500 loops) with randomized seat order and random legal singles.
3. **Duplicate pass attempts**: same player sends repeated pass events (same and different actionIds); trick resolution remains correct.
4. **Players-out variants**: only 1 or 2 responders remain active; all active responders pass -> trick ends immediately.
5. **Bomb interruption variant**: ensure post-bomb responder accounting still resolves correctly.
6. **Wish active variant**: pass restrictions still work; once legal passes complete, trick resolves correctly.
7. **Dog priority variant**: Dog receiver cannot pass, and if others pass after Dog receiver plays, trick resolves without returning turn to lead incorrectly.
8. **Dragon selection variant**: when a dragon single wins, trick pauses for opponent selection as today (no premature trick clear).

## Regression risks and protections

Potential side effects if refactor is done carelessly:

- Dog flow may break if we overwrite `dogPriorityPlayer` semantics.
- Dragon flow may break if trick resolution helper auto-calls `winTrick()` before dragon selection behavior is applied.
- Bomb interruption flow may break if "acted since lead" is not based on latest lead play.

Protections to include during implementation:

- Keep special-card handling order unchanged (`handleSpecialCards` before trick-resolution helper).
- Gate the new helper to preserve existing Dragon behavior (`dragonOpponentSelection` still blocks next play).
- Reuse existing `hasActedSinceLead` logic initially (then simplify only after tests pass).
- Add temporary debug assertions for:
  - `leadPlayer`, `currentPlayerIndex`, `currentTrick.length`, `passedPlayers`
  - computed `eligibleResponders` vs `actedResponders`
  - whether trick was resolved or next responder selected

## Confidence and scope

This plan is high-confidence for the reported bug because it removes the current multi-branch/pass-wrap ambiguity and replaces it with one explicit "all eligible responders acted" rule.

No plan can guarantee 100% without implementation + stress tests in production-like traffic. The acceptance bar is:

- deterministic pass resolution in automated stress tests, and
- no "beat your own card" incidents during repeated manual multiplayer validation.

## Rollout plan

1. Refactor only pass/trick resolution into shared helper (no rule changes).
2. Add invariants and debug logging behind env flag.
3. Run full backend integration test suite.
4. Manually validate with 4 real clients:
   - repeated "lead + 3 passes" rounds
   - duplicate rapid pass clicks
   - mixed mobile/desktop clients
5. Remove/quiet debug logs after validation.

## Acceptance criteria

- No scenario where lead is prompted to beat their own unresolved trick after all eligible opponents have acted/passed.
- Trick transitions are deterministic across repeated runs.
- Existing Dog, Dragon, Bomb, Mah Jong wish behavior remains unchanged (except bug fix).
- New regression tests cover the repro and pass reliably.
