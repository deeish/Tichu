# Finally Killing the Freeze Bug: Full Plan

This document is the **master plan** to ensure the main-thread freeze (see **docs/FREEZE_BUG_FIX.md**) never happens again. It is based on exploration of the codebase and identification of every path that applies game state to React. **Do not change application code until this plan is approved; then implement in the order below.**

---

## Deep dive: Root cause and why this plan fixes it

**What actually happens when the tab freezes**

1. **Trigger:** A socket event delivers a full game object to the client (**game-update** or **game-state**).
2. **Current code for game-state:** The handler runs **synchronously** in the socket callback:
   - `JSON.parse(JSON.stringify(data.game))` — deep clone of the entire game (can be slow if `roundLog`, `playerStacks`, `trickHistory` are large).
   - `normalizeGameState(...)` — only `currentTrick` is capped today; `roundLog` and `playerStacks[].cards` are uncapped.
   - `setGameStateRef.current(nextGame)` — React then runs a full re-render: App → GameBoard → Trick + HandDock.
3. **Where it blocks:** The original bug was traced to **HandDock-after-map** — i.e. during or right after the `visibleCards.map(...)` that renders each card in the hand (HandDock.jsx). So the main thread is stuck in: **clone (socket callback)** + **setState** + **React reconciliation/layout/paint** for the whole tree, with no chance to yield.
4. **Why game-update was “fixed”:** We wrapped the apply in `startTransition` and throttled how often game-update is sent. So (a) React treats the update as low-priority and can interrupt the **render** phase, and (b) we do that work less often. The **game-state** path was never wrapped, so Resync (or rejoin during play) still does clone + setState **synchronously** in the socket callback and can freeze the tab.
5. **Why payload size matters:** Even inside `startTransition`, the **clone** (`JSON.parse(JSON.stringify(...))`) is our own synchronous JS — React cannot interrupt it. If the game has 200 rounds in `roundLog` or huge `playerStacks[].cards`, the clone alone can block the main thread for hundreds of ms. So **caps in normalizeGameState (Phase 2)** are required to keep the clone short; **startTransition (Phase 1)** makes the subsequent setState and render interruptible.

**Conclusion:** The freeze has two contributing factors: **(A) urgent updates** — some paths (game-state, and lobby events) call setState without startTransition; **(B) unbounded payloads** — roundLog and playerStacks can grow without limit, so clone and render cost can explode. The plan removes (A) by wrapping every full-game apply in startTransition, and (B) by capping roundLog and playerStacks in normalizeGameState. Together, that is sufficient to prevent the freeze.

**Implementation detail for Phase 1.1 (game-state):** The **entire** apply block must be inside the startTransition callback, **including** the clone. I.e. capture `data.game` in a variable outside, then inside startTransition: clone (JSON.parse(JSON.stringify)), normalize, setState, setPlayerId, setGameId, version bumps, saveRejoinCreds. If the clone were left outside startTransition, the socket callback would still block on the clone. Phase 2 caps ensure that when the transition runs, the clone is fast.

---

## Why the freeze can still happen

The original fix (startTransition for **game-update** + server throttle) is in place and works for the high-frequency path. The freeze can still occur because:

1. **game-state** is applied **without** startTransition. When the user clicks Resync (or rejoin / lobby updates emit game-state), the client does a full clone and **synchronous** setState. That triggers the same heavy render chain (GameBoard → Trick → HandDock) on the main thread and can freeze the tab.
2. **Other socket events** that set full game state (**game-created**, **player-joined**, **game-started**, **player-left**) also call setState directly. They usually run in lobby when the payload is small, but they are still urgent and could contribute under edge cases.
3. **Payload size is unbounded** for `roundLog` and `playerStacks[].cards`. `normalizeGameState` only caps `currentTrick`. In long games the object we clone and render grows; a single update (even inside startTransition) can still block the main thread long enough to feel like a freeze.

---

## What we missed: Stale overwrite (desync / “bugged out” after Phase 1–4)

After implementing Phase 1–4, the **freeze** was addressed, but a related failure appeared: the game could **desync or “bug out” mid gameplay** (e.g. center shows “No cards played yet” despite an active trick, duplicate or wrong player names, wrong turn label, or a gray/blank main area). That comes from a **third cause** the original plan did not address.

**Cause: Update ordering when everything uses startTransition**

Once every full-game apply runs inside `startTransition`, React can **defer and reorder** those updates. The order in which two updates are **applied** is no longer guaranteed to match the order in which the socket events **arrived**. So:

- **game-update** (with current trick, correct players) arrives → we schedule transition A.
- **game-state** arrives (from Resync, rejoin, update-player-name, set-player-team, or get-game-state) → we schedule transition B.

If React runs B **after** A, we overwrite the good state with whatever is in B. If B was older (e.g. a game-state response from a moment when the trick was empty, or from a different view), the UI shows stale/wrong state: “No cards played yet”, wrong players, wrong turn. So we **prevented the freeze** but introduced a **desync** when multiple full-game events are in flight.

**When does game-state get sent?** (So we know when this can happen during play.)

| Trigger | File | When |
|--------|------|------|
| **get-game-state** (Resync) | socketHandlers.js | User clicks Resync; server sends current game. |
| **rejoin** | socketHandlers.js | After reconnect; server sends game-state then immediately `broadcastGameUpdate`. Client can receive both; order not guaranteed. |
| **update-player-name** | socketHandlers.js | User saves name in lobby; server emits game-state to all players in the game. |
| **set-player-team** | socketHandlers.js | User changes team in lobby; server emits game-state to all. |
| **randomize-teams** | socketHandlers.js | Host randomizes; server emits game-state to all. |

So during active play, we can get **game-state** from Resync or (if the server ever sent it mid-game) from name/team. We always get **game-update** on every move (throttled). With both in startTransition, the last-applied update wins; if that’s a stale game-state, we desync.

**Existing hint:** The codebase already warns not to request get-game-state in the trick-won handler, because a delayed game-state (empty trick) would overwrite the winner’s lead play. The same overwrite can happen purely from **ordering** when both game-update and game-state are scheduled in startTransition.

**Mitigation (to implement in a future phase):** Prevent applying a full-game state that would overwrite newer data. Options:

1. **Prefer game-update when pending:** When we receive **game-state**, check if there is a **pending** game in `pendingGameRef` (from the game-update throttle). If so, either (a) ignore this game-state and let the pending game-update apply when the throttle fires, or (b) apply the pending game first, then ignore this game-state. That way we never overwrite “latest from game-update” with “older from game-state”.
2. **Time-based guard:** Track the time we last applied a **game-update**. When we receive **game-state**, only apply it if we haven’t applied a game-update in the last N ms (e.g. 200–500). So a game-state that lands right after a burst of game-updates doesn’t overwrite.
3. **Server-side state version:** Add a monotonic `stateVersion` (or `lastUpdatedAt`) to the game on the server and send it with both game-update and game-state. Client only applies an incoming payload if its version is ≥ current. Then stale game-state is never applied.

Until one of these (or a similar ordering safeguard) is in place, “bugged out” / desync can still occur when game-state and game-update are both in flight, even though the freeze is fixed.

---

## Principles

- **No urgent full-game setState:** Every path that applies a full game object to React state must run inside `startTransition` so React can interrupt and keep the UI responsive.
- **Bounded payloads:** Clone and render must never operate on unbounded arrays. Cap `roundLog` and `playerStacks` in `normalizeGameState` so one bad or very long game cannot blow up the main thread.
- **Single source of truth:** All apply logic should live in one place (or one pattern) so future socket events don’t reintroduce an urgent path.

---

## Full plan (implementation order)

### Phase 1: Make every full-game apply non-urgent

**Goal:** Ensure no socket handler can trigger an urgent, blocking setState with a full game.

| Step | File | What to do |
|------|------|------------|
| 1.1 | `frontend/src/App.jsx` | **game-state** handler: Capture `data.game` in a variable, then wrap the entire apply block (clone, normalize, setGameStateRef.current, setPlayerId, setGameId, setGameStateVersion, setResyncVersion, saveRejoinCreds) in `startTransition(...)`. Use the same pattern as game-update (variable outside callback, use inside). |
| 1.2 | `frontend/src/App.jsx` | **game-created** handler: Wrap `normalizeGameState(data.game)` and `setGameState(game)` (and the rest of the block) in `startTransition(...)`. |
| 1.3 | `frontend/src/App.jsx` | **player-joined** handler: Same — wrap apply + setGameId + setPlayerId + saveRejoinCreds in `startTransition(...)`. |
| 1.4 | `frontend/src/App.jsx` | **game-started** handler: Wrap setState in `startTransition(...)`. |
| 1.5 | `frontend/src/App.jsx` | **player-left** handler: Wrap setState in `startTransition(...)`. |

**Verification:** Search the repo for `setGameState` and `setGameStateRef.current` and confirm every call that receives a full game from the server is inside a `startTransition` callback. The only exceptions should be local UI updates (e.g. setGameState(prev => ...) for team/name) and initial state.

---

### Phase 2: Cap payload size in normalizeGameState

**Goal:** Ensure we never clone or pass to setState unbounded arrays, so a single update cannot freeze the main thread regardless of game length or bugs.

| Step | File | What to do |
|------|------|------------|
| 2.1 | `frontend/src/App.jsx` | Add constants: e.g. `MAX_ROUND_LOG_ENTRIES = 80`, `MAX_STACK_CARDS = 56` (one deck). Document that they are for freeze mitigation. |
| 2.2 | `frontend/src/App.jsx` | In `normalizeGameState`, after existing currentTrick/passedPlayers/currentPlayerIndex logic: if `next.roundLog` is an array and `next.roundLog.length > MAX_ROUND_LOG_ENTRIES`, set `next.roundLog = next.roundLog.slice(-MAX_ROUND_LOG_ENTRIES)`. |
| 2.3 | `frontend/src/App.jsx` | In `normalizeGameState`, if `next.playerStacks` is an object: shallow-copy it, then for each key, if that stack has an array `cards` with length > MAX_STACK_CARDS, replace that stack with `{ ...stack, cards: stack.cards.slice(0, MAX_STACK_CARDS) }`. Leave `points` and other fields unchanged. |

**Verification:** Unit test or manual test that normalizeGameState returns roundLog of length ≤ 80 and each playerStacks[id].cards of length ≤ 56 when given larger inputs. Confirm the rest of the game object is unchanged.

---

### Phase 3: Keep existing game-update and server behavior

**Goal:** No regressions; existing fixes stay.

| Step | File | What to do |
|------|------|------------|
| 3.1 | — | **Do not remove** startTransition from any game-update path in App.jsx. |
| 3.2 | — | **Do not remove** the client throttle (GAME_UPDATE_THROTTLE_MS / pendingGameRef / setTimeout) for the non-immediate game-update path. |
| 3.3 | — | **Do not remove** the server broadcast throttle (BROADCAST_THROTTLE_MS, gameUpdateThrottle, emitGameUpdateToAll) in socketHandlers.js. |
| 3.4 | — | **Do not remove** currentTrick caps (MAX_TRICK_PLAYS, MAX_CARDS_PER_PLAY) in normalizeGameState. |

**Verification:** Grep for startTransition, GAME_UPDATE_THROTTLE_MS, BROADCAST_THROTTLE_MS, and the throttle Map; confirm they are still present and used as in FREEZE_BUG_FIX.md.

---

### Phase 4: Documentation and regression prevention

**Goal:** Future changes don’t reintroduce an urgent full-game apply or unbounded payloads.

| Step | File | What to do |
|------|------|------------|
| 4.1 | `docs/FREEZE_BUG_FIX.md` | Add a short section: “Permanent fix (see FINALLY_KILLING_THE_FREEZE_BUG.md)” and list that (1) all socket handlers that apply full game use startTransition, and (2) normalizeGameState caps roundLog and playerStacks. Add the safeguard row to the Summary table if not already there. |
| 4.2 | `frontend/src/App.jsx` | In the comment above normalizeGameState, mention that it caps roundLog and playerStacks for freeze mitigation (see FINALLY_KILLING_THE_FREEZE_BUG.md). |
| 4.3 | `frontend/src/App.jsx` | In the game-state handler (after implementing Phase 1), add a one-line comment: “Apply in startTransition so Resync never blocks main thread (freeze fix).” |

**Verification:** Read through both docs and the commented code; confirm a new contributor would understand why every full-game apply uses startTransition and why caps exist.

---

### Phase 5: Optional hardening (if needed)

**Goal:** Extra safety only if freezes persist after Phases 1–4.

| Step | File | What to do |
|------|------|------------|
| 5.1 | `frontend/src/App.jsx` | Consider applying game-state inside requestAnimationFrame or setTimeout(0) before startTransition, so the socket callback returns immediately and the apply runs in the next tick. (Optional; startTransition alone may be enough.) |
| 5.2 | `backend/server/socketHandlers.js` | Consider throttling get-game-state responses per socket (e.g. one response per 100–200 ms per client) to avoid Resync storms. (Optional.) |

**Verification:** Only implement if the freeze is still observed in production or stress tests after Phases 1–4.

---

### Phase 6: Prevent stale overwrite (desync fix)

**Goal:** Ensure a stale **game-state** (or an old full-game payload) never overwrites newer **game-update** state, so the UI cannot “bug out” with “No cards played yet” or wrong players/turn when both events are in flight. See “What we missed: Stale overwrite” above.

| Step | File | What to do |
|------|------|------------|
| 6.1 | `frontend/src/App.jsx` | **Option A (prefer game-update when pending):** In the **game-state** handler, before scheduling startTransition, check `pendingGameRef.current`. If it is set (a game-update is queued or about to apply), either skip applying this game-state, or flush the pending game-update first and then skip this game-state so we don’t overwrite with older data. Document the choice in a comment. |
| 6.2 | `frontend/src/App.jsx` | **Option B (time-based guard):** Track `lastGameUpdateApplyRef.current = Date.now()` whenever we apply a game-update. In the game-state handler, only apply the incoming game-state if `Date.now() - lastGameUpdateApplyRef.current > STALE_GAME_STATE_MS` (e.g. 300). Otherwise ignore (or schedule a single Resync retry after a short delay). |
| 6.3 | **Or** backend + frontend | **Option C (server state version):** Add a monotonic `stateVersion` (or `lastUpdatedAt`) to the game object on the server, incrementing it (or updating the timestamp) whenever the game changes. Send it in both game-update and game-state. On the client, keep `appliedStateVersionRef` and only apply an incoming payload if its version is ≥ the ref; then update the ref. Reject stale payloads. |

Implement **one** of 6.1, 6.2, or 6.3. Option A is client-only and minimal; Option B is client-only and simple; Option C is the most robust but touches the server.

**Verification:** Manual test: during active play, trigger a game-state (e.g. Resync or an action that emits game-state). UI should not flip to “No cards played yet” or wrong players; the most recent game-update state should win or game-state should be ignored when it’s stale.

---

## Checklist before merging

- [ ] Phase 1: Every socket handler that applies a full game (game-state, game-created, player-joined, game-started, player-left) uses startTransition.
- [ ] Phase 2: normalizeGameState caps roundLog (e.g. last 80) and playerStacks[].cards (e.g. 56).
- [ ] Phase 3: No removal or weakening of game-update startTransition, client throttle, or server throttle.
- [ ] Phase 4: FREEZE_BUG_FIX.md and App.jsx comments updated; FINALLY_KILLING_THE_FREEZE_BUG.md is the source of truth for the full plan.
- [ ] Phase 6: Stale overwrite safeguard in place (Option A, B, or C) so game-state never overwrites newer game-update state.
- [ ] Manual test: Play several rounds, click Resync during play, play a long game; no tab freeze and no desync (“No cards played yet” / wrong players).
- [ ] No new lint or test failures.

---

## Summary

| Phase | Purpose |
|-------|---------|
| 1 | Make **game-state** (and all other full-game applies) non-urgent with startTransition so the freeze path is never triggered by Resync or other events. |
| 2 | Cap **roundLog** and **playerStacks.cards** in normalizeGameState so payload size is bounded and one update can’t freeze the main thread. |
| 3 | Keep existing game-update and server throttling; no regressions. |
| 4 | Document the permanent fix and add comments so the bug doesn’t come back. |
| 5 | Optional extra hardening only if needed. |
| 6 | Prevent **stale overwrite**: ensure game-state (or any older full-game payload) never overwrites newer game-update state, so the UI cannot desync (“No cards played yet”, wrong players/turn). |

Once this plan is implemented and the checklist is done, the freeze should be permanently addressed and the desync (“bugged out” UI) should be prevented by Phase 6. If the freeze reappears, re-open this doc and ensure no new code path applies a full game to state without startTransition and that normalizeGameState still enforces the caps. If desync reappears, ensure the Phase 6 ordering safeguard is still in place.

---

## Double-check: Why this plan guarantees we don’t hit the freeze again

**1. Every path that applies a full game is covered**

As of the last audit, the only way a full game object reaches React state is via `setGameState` / `setGameStateRef.current` in `App.jsx`. All such call sites are:

| Call site (line) | Trigger | In plan? |
|------------------|--------|----------|
| 141 | game-created | Phase 1.2 – wrap in startTransition |
| 151 | player-joined | Phase 1.3 – wrap in startTransition |
| 162 | game-started | Phase 1.4 – wrap in startTransition |
| 183, 187 | game-update (immediate) | Already in startTransition (Phase 3 – keep) |
| 201, 205 | game-update (throttled) | Already in startTransition (Phase 3 – keep) |
| 213 | game-update (fallback) | Already in startTransition (Phase 3 – keep) |
| 227 | game-state | Phase 1.1 – wrap in startTransition |
| 241 | player-left | Phase 1.5 – wrap in startTransition |
| 298 | handleLeaveParty (null) | Not a full game; tiny payload. No change needed. |
| 319, 344 | setGameState(prev => …) (team/name) | Local UI only; not server payload. Exceptions per plan. |

So after Phase 1, every server-driven full-game apply runs inside startTransition. No path can block the main thread with an urgent, heavy update.

**2. Every apply goes through normalizeGameState**

All of the handlers above that set a full game either call `normalizeGameState(...)` before setState or pass a value that was already normalized (game-created, player-joined, game-started, player-left). So once Phase 2 caps are added to normalizeGameState, every applied payload is bounded (currentTrick, roundLog, playerStacks) before it ever reaches setState. That limits both clone cost and render cost.

**3. Bounded payloads**

- **currentTrick:** Already capped (MAX_TRICK_PLAYS, MAX_CARDS_PER_PLAY). Phase 3 keeps it.
- **roundLog:** Phase 2 caps to last 80 entries.
- **playerStacks[].cards:** Phase 2 caps to 56 per stack.

So a single update cannot carry unbounded arrays, regardless of game length or server bugs.

**4. One remaining optional safeguard: trickHistory**

The server sends the full game (getPlayerView does a shallow copy), which includes `trickHistory` — an array that grows every trick. In a very long game it could make the clone step slow. The plan does not require capping it because the freeze was observed in the render path (HandDock), not in clone; and roundLog + playerStacks are the largest per-round growth. For extra safety, Phase 2 can optionally add:

- **Step 2.4 (optional):** In normalizeGameState, if `next.trickHistory` is an array and `next.trickHistory.length > MAX_TRICK_HISTORY` (e.g. 100), set `next.trickHistory = next.trickHistory.slice(-MAX_TRICK_HISTORY)`.

Implement 2.4 if you want to bound clone cost in extremely long sessions; otherwise the plan as-is is sufficient for normal play.

**5. Future-proofing**

Phase 4 documents the rule: any new socket event that sends a full game must apply it inside startTransition and through normalizeGameState. The checklist and comments make it hard to reintroduce an urgent path by mistake.

**6. Stale overwrite (desync) — addressed in Phase 6**

Phases 1–4 fix the **freeze** but do not fix **desync**: when both game-update and game-state are in flight, startTransition can apply them in an order that lets a stale game-state overwrite newer game-update state (see “What we missed: Stale overwrite” above). Phase 6 adds a safeguard (prefer pending game-update, time-based guard, or server state version) so stale full-game state is never applied. After Phase 6, the “bugged out” / “No cards played yet” desync should not arise.

**Conclusion:** After Phases 1–4 (and optional 2.4 and 5), no socket handler can trigger an urgent full-game setState, and no single update can contain unbounded arrays—so the **freeze** should not arise. After Phase 6, **stale overwrite** is prevented and the **desync** (“bugged out” UI) should not arise.
