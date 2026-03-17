# The Game-Breaking Freeze Bug: What It Was and How We Fixed It

This document describes the random browser freeze that could make the Tichu tab (and sometimes the whole browser) unusable, how we tracked it down, and the solution we implemented. It’s here so future work doesn’t regress the fix and so the same approach can be reused if similar issues appear.

---

## What the bug was

- **Symptom:** During a game, the tab would sometimes freeze: the main thread hung, the UI stopped responding, and after ~30 seconds the socket disconnected. There was no thrown exception and no stack trace — the main thread was simply stuck.
- **Where it happened:** The freeze occurred in the **render path** triggered by a **game-update** from the server. The sequence was: **game-update** → **setState** → **GameBoard** → **Trick** → **HandDock**. Breadcrumbs showed the last step before the freeze was always **HandDock-after-map** — i.e. right after rendering the hand card list, before the deferred dock-hint and dock-actions block. So the hang was in or immediately after React’s work for that list (reconciliation, layout, or paint), not in our deferred UI.
- **Why it was so bad:** It was intermittent and left no error or stack, so it was hard to reproduce and debug. Memoizing HandDock children and deferring dock-hint/dock-actions did **not** fix it; the expensive work was still being triggered by the sheer volume and urgency of game state updates.

---

## How we found it

We added a lot of instrumentation (see **docs/BUGS.md**):

- **Breadcrumbs** in hot paths: `game-update`, `game-update-apply`, `game-update-apply-setState`, `game-update-after-setState`, and inside **HandDock** (e.g. `HandDock-after-map`, before/after dock-hint, after dock-actions).
- A **Web Worker** that keeps sending heartbeats to the server; when the main thread freezes it stops updating the worker, so the server sees **mainThreadSilentMs** climb and logs **"MAIN THREAD SILENT FOR X s — LIKELY FROZEN"**.
- The worker sends the **last breadcrumbs** with each report, so the server log shows the **exact code path** when the main thread stopped (e.g. `game-update → game-update-apply-setState → … → HandDock-after-map`).

That trail made it clear: the freeze was in the **game-update → setState → … → HandDock** chain, and always stopped right after the hand list. So the fix had to (1) reduce how *urgent* that work was, and (2) reduce how *often* it was triggered.

---

## The solution (what we actually did)

We made two main changes: **client-side** (React) and **server-side** (throttling).

### 1. Client: Mark game-update state updates as non-urgent (`startTransition`)

**File:** `frontend/src/App.jsx`

**What we did:** We wrapped **every** place that applies a **game-update** to state in React’s **`startTransition`**.

- **Immediate path** (when there are plays in the trick or the local player went out): the whole block that clones the game, calls `setGameStateRef.current(cloned)`, updates `setPlayerId`, and records the trace is now inside `startTransition(() => { ... })`.
- **Throttled path** (the `setTimeout` callback that runs after `GAME_UPDATE_THROTTLE_MS`): the same apply/setState/trace block is inside `startTransition`.
- **Fallback path** (when `game` is missing or not an object): `setGameStateRef.current(normalizeGameState(game))` and the trace are inside `startTransition`.

**Why this fixes it:** `startTransition` tells React that these updates are **transitions** — important but not urgent. React can then:

- Interrupt or pause this work to keep input and animation responsive.
- Batch or defer some of the work so the main thread doesn’t get stuck in one big render/layout/paint after a single game-update.

So we didn’t change *what* we render; we changed *how urgent* that work is. That prevents the main thread from being monopolized by game-update-driven renders and avoids the freeze we saw at HandDock-after-map.

**Implementation detail:** We capture the game (or pending snapshot) in a variable **outside** `startTransition` (e.g. `gameToApply = game` or `pending` from the ref) and use that inside the callback, so we never close over a stale value.

### 2. Server: Throttle `broadcastGameUpdate` per game

**File:** `backend/server/socketHandlers.js`

**What we did:** We limited how often the server can send **game-update** to the same game.

- Introduced **`emitGameUpdateToAll(io, game)`**: this is the actual logic that loops over `game.players` and emits `game-update` with the right player view to each socket. All real emits go through this.
- Replaced **`broadcastGameUpdate(io, game)`** with a **per-game throttle**:
  - **Constants:** `BROADCAST_THROTTLE_MS = 80` and a `gameUpdateThrottle` Map: `gameId → { timerId, pending }`.
  - **First call for a game (or after the previous throttle window):** Emit immediately via `emitGameUpdateToAll(io, game)`, then create an entry with a `setTimeout(BROADCAST_THROTTLE_MS)`. When the timer fires, if there is a `pending` game for that `gameId`, emit it and clear the entry.
  - **Later calls within the same window:** Don’t emit; only set `entry.pending = game`. When the timer runs, we emit that latest `pending` once. So rapid updates (e.g. many moves in quick succession) are coalesced into at most one broadcast per 80 ms per game.

**Why this helps:** Fewer game-update events mean fewer setState → render chains on the client. Together with `startTransition`, the client is both updating less often and doing that work in a non-blocking way.

**Race fix:** When the throttle timer fires, we must only remove the throttle entry we actually own. If we always did `gameUpdateThrottle.delete(gameId)`, a **concurrent** `broadcastGameUpdate` (right after we cleared the entry but before our `delete`) could create a **new** entry, and our `delete` would remove that new one and leak the old state. So we only delete when the entry is still the same object: `if (gameUpdateThrottle.get(gameId) === e) gameUpdateThrottle.delete(gameId)`.

---

## Summary

| Part | Change |
|------|--------|
| **Bug** | Random main-thread freeze in the game-update → setState → GameBoard → Trick → HandDock path, last breadcrumb always HandDock-after-map; no exception, tab/socket died ~30s later. |
| **Cause** | Too much urgent, synchronous work triggered by game-update (React render/layout/paint), plus a high rate of game-update events from the server. |
| **Client fix** | Wrap **all** game-update apply paths in **`startTransition`** in `App.jsx` so React treats these updates as non-urgent and can keep the UI responsive. |
| **Server fix** | **Throttle** `broadcastGameUpdate` per game (80 ms): emit immediately on first call, coalesce further calls into one emit when the timer fires; only delete the throttle entry when it’s still the same reference (race fix). |
| **Permanent safeguard** | All full-game apply handlers (game-state, game-created, player-joined, game-started, player-left) use startTransition; normalizeGameState caps roundLog and playerStacks (see FINALLY_KILLING_THE_FREEZE_BUG.md). |

The fix is in place in **App.jsx** (startTransition) and **socketHandlers.js** (throttle + `emitGameUpdateToAll`). Keeping this document and the comments in those files should prevent accidental reversion and make it clear why the code is structured this way.

---

## Permanent fix (see FINALLY_KILLING_THE_FREEZE_BUG.md)

To ensure the freeze never comes back, we also:

1. **All socket handlers that apply a full game** (game-state, game-created, player-joined, game-started, player-left) apply state inside **`startTransition`**, so Resync and lobby updates never block the main thread.
2. **`normalizeGameState`** caps **roundLog** (last 80), **playerStacks[].cards** (56), **hands** (56 per player), and **trickHistory** (last 100) so clone and render never see unbounded arrays.
3. **Normalize before clone:** For **game-state** and **game-update**, we call **`normalizeGameState(payload)` first**, then inside `startTransition` we **deep-clone the normalized result** only. That way the main thread never runs `JSON.parse(JSON.stringify(...))` on an unbounded payload (which was still causing freezes when roundLog/hands/trickHistory were large).

The full plan, double-check table, and implementation order are in **docs/FINALLY_KILLING_THE_FREEZE_BUG.md**.

---

Simply what happen:
The main issue was too much urgent work on the main thread: every game-update from the server caused an immediate setState and a full re-render of the game UI. When updates came in quickly, React kept doing heavy render/layout/paint work back-to-back, the main thread got blocked, and the tab froze. Fix: treat those updates as non-urgent with startTransition and send fewer of them by throttling on the server, so the main thread isn’t overloaded.