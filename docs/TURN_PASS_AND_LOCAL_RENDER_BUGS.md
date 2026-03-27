# Turn resolution & local pass rendering — investigation & fix tracker

Working document for two **related** intermittent gameplay issues. Update this file as you reproduce, narrow causes, and ship fixes.

## Direct answer: will *this doc* solve our two bugs completely and safely?

**No.** This file is **not** a fix. It does **not** change runtime behavior. **Nothing in this markdown can** guarantee that:

| Your bug | Can this doc alone “solve it completely”? | Why |
|----------|---------------------------------------------|-----|
| Turn sometimes doesn’t end after all passes, or with 3 out / 1 left with cards | **No** | Needs real **debugging** (server rules and/or client apply path). The doc only lists **where to look** and **hypotheses**. |
| Pass doesn’t render on the passer’s screen; refresh fixes it | **No** | Same: likely **client snapshot** logic, but the doc does **not** ship code. |

**“Without causing any issues in game”** cannot be promised for **future code changes** until those changes are written, reviewed, and tested in real four-player sessions. This document **reduces wrong turns** in investigation (e.g. it corrects the “pass always hits throttle” mistake) but **does not replace** implementation and QA.

### Implemented in code (`frontend/src/App.jsx`)

These are **real** client-side mitigations (not doc-only). They target **Bug B** (local pass / turn UI) and **client-only** symptoms of **Bug A** (stuck turn while server is correct).

1. **`game-update` throttling only in lobby (`waiting` state)** — During play, exchange, round-ended, etc., every snapshot is applied on the **immediate** path (no ~90 ms batching). Lobby still uses the throttle to limit churn.  
2. **`game-state` flushes pending throttled updates** — Clears `pendingGameRef` and the throttle timer before applying a full `game-state` so resync/rejoin is not dropped while a delayed `game-update` is queued.  
3. **`findMyPlayerInWireSnapshot`** — Resolves “me” by `socket.id` first, then `token`, in `game-update` / `game-state` / `game-created` apply paths (same class of bug as lobby token ordering).  
4. **Opt-in `[game-sync]` debug** — When `VITE_DEBUG_GAME_SYNC=true` or `localStorage.getItem('tichu_debug_game_sync') === '1'`, logs stale drops (`game-update` / `game-state`) and ignored clone-worker responses (H-B1 / H-B4 diagnosis).

**Server** (`moveHandler.js` / `scoring.js`) was **not** changed in this pass. If trick/round still fail to advance for **all** clients, keep investigating server-side.

---

## Remaining work

### Completed (follow-up pass)

- [x] **`stateVersion` contract** documented in [`STATE_VERSION_CONTRACT.md`](./STATE_VERSION_CONTRACT.md) (server bump rules + client stale suppression).
- [x] **Unit tests** for tailender defer: `backend/tests/unit/tailenderTrickDefer.test.js` (single play in trick → defer; multiple plays → round can end).
- [x] **Optional pass logging** on the server: set `DEBUG_TICHU_PASS=1` when running the backend; each successful **pass** logs one JSON line (`gameId`, `playerId`, `stateVersion` before broadcast, trick/pass counts, `requestId`).
- [x] **Integration tests — pass with players already out:** `backend/tests/integration/passWithPlayersOut.test.js` (2 out / 1 out scenarios; trick must clear and lead assigned correctly).
- [x] **`isPlayerOut(game, playerId)` in `moveHandler.js`** — string-normalized `playersOut` checks everywhere we previously used `playersOut.includes` (reduces stuck turns when ids differ by type).
- [x] **H-A4 — persistence** — documented below (Redis vs in-memory; reconnect behavior).
- [x] **`fullGame.test.js` bot** — lead player never sends `pass` (matches server “lead cannot pass”); reduces flaky full-game integration failures.

### Persistence / reconnect (H-A4)

- **Default:** Games live **in memory** only; **no** shared snapshot.
- **Redis (`REDIS_URL`):** `server/gamePersistence.js` debounces JSON snapshots to Redis **after** `notifyGamePersist(game)`. After a **process restart**, restored games have **no live sockets** (`socketId` cleared, `disconnected` true); clients must **rejoin** with token.
- **Same-session** “stuck” play is **not** caused by Redis writes alone; investigate **server rules + socket** path. **Stale UI** after reconnect is **expected** until resync/rejoin.

### Still open (needs repro, playtest, or deeper server work)

- [x] **Bug A — server logic** (partial): `moveHandler.js` empty-hand branch compared `passedPlayers.length` to `players.length - 1` (always 3). With **one player already out**, only **two** opponents pass → trick + `winTrick` were skipped and the trick could stay non-empty. **Fixed** by counting **active opponents with cards**; regression: `passWithPlayersOut` mid-trick snapshot test.
- [ ] **Bug A — remaining**: Other H-A1/H-A2 edge cases if **every** client still sees a stuck state; add tests if you reproduce.
- [x] **Bug B — edge cases** (H-B1, H-B4): **Opt-in client logging** — `VITE_DEBUG_GAME_SYNC=true` or `localStorage tichu_debug_game_sync=1` logs stale `game-update` / `game-state` drops and clone-worker ignored responses (`frontend/src/App.jsx`). Use when reproducing after mitigations.
- [ ] **Manual QA**: Four real players/tabs, note whether only one screen is wrong vs all four (separates client vs server).
- [ ] **Fill “Fix ideas” tables** (F-A1, F-B1, …) when you land concrete PRs.

---

## Important: what this file is *not*

- **This markdown file does not fix anything by itself.** It does not change server or client code. Finishing the checklists here does **not** guarantee the bugs are gone.
- **A complete fix** will require **reproducing** (or adding logging/tests), **identifying** the real root cause (server rule bug vs client snapshot bug vs both), then **shipping code** with regression tests. Until then, treat every hypothesis as unproven.
- **Changing client throttle / `stateVersion` logic without care** can cause **new** issues (extra renders, stale UI the other direction, or heavier CPU). Any fix should be validated in real four-player sessions.

---

## How to use this doc

- [ ] Add **repro steps** when you can trigger a bug reliably (even 1 in 5 helps).
- [ ] Note **server vs client**: browser Network tab (socket events), server logs, and whether **refresh** fixes only the reporter’s UI.
- [ ] Link **PRs / commits** next to each hypothesis when verified or ruled out.

---

## Bug A — Turn / trick / round does not advance when it should

**Symptoms (reported)**

- [ ] Sometimes the turn **does not end** after **everyone has passed** (trick should resolve and someone should lead next).
- [ ] Sometimes when **three players have finished** their hand and **one player still has cards**, the game **does not** progress as expected (last player stuck or round does not resolve).

**Why A and B may be linked**

Both can involve **trick completion**, **pass chains**, **empty hands**, and **who leads next**. Server logic for “end trick”, “round ended”, and “skip players with no cards” is concentrated in move handling and scoring; the client may also **drop or delay** snapshots so the table looks stuck even when the server is correct.

### Likely server areas to read

| Area | File(s) | Notes |
|------|---------|--------|
| Pass / play / trick advance | `backend/game/moveHandler.js` (`makeMove`, pass branch, `passedPlayers`, advancing `currentPlayerIndex`) | Loop that ends trick when everyone after lead has acted; edge cases when some hands are empty. |
| Player goes out / round end | `backend/game/scoring.js` (`handlePlayerWin`, `playersOut`, `roundEnded`) | Four players out, resolving last trick, `game.state === 'round-ended'`. |
| Broadcast after move | `backend/server/socketHandlers.js` | Ensures `broadcastGameUpdate` runs after state changes; `stateVersion` monotonicity. |

### Hypotheses (unchecked until proven)

- [ ] **H-A1 — Server logic edge case:** Pass / “all acted” detection fails when `playersOut` or empty hands interact with `turnOrder` / `passedPlayers` (e.g. off-by-one, stale `leadPlayer`, or `hasActedSinceLead` in unusual order).
- [ ] **H-A2 — Server state stuck:** `currentTrick` / `passedPlayers` / `currentPlayerIndex` not cleared or advanced in a branch that only runs in rare orderings.
- [ ] **H-A3 — Client never applies final snapshot:** *(partially mitigated, 2026-03-25)* Lobby-only throttle + `game-state` flush + `findMyPlayerInWireSnapshot`; still possible if server emits bad `stateVersion` or clone-worker edge case.
- [ ] **H-A4 — Persistence / reconnect:** *(documented in “Persistence / reconnect” above)*; reload fixes client-only symptoms; if reload fixes **everyone**, suspect server.

### Fix ideas (fill in as you learn)

| ID | Description | Status |
|----|-------------|--------|
| F-A1 | Go-out after all **active** opponents passed uses `othersStillInWithCards` not `players.length - 1` (`moveHandler.js`); `passWithPlayersOut` synthetic mid-trick test | Landed 2026-03-25 |
| F-A2 | | |

### Tests / repro checklist

- [ ] Log or capture **one full trick** where all three passes occur; compare server `game` after last pass vs client `gameState`.
- [ ] Scenario: **3 players empty**, **1 player with cards** — log `playersOut`, `hands`, `currentPlayerIndex`, `state` after each out.
- [ ] Add or extend **unit tests** in `backend/game/` for pass chains and last-player-with-cards (if not already covered).

---

## Bug B — Own pass does not show on the passing player’s screen (others see it)

**Symptoms (reported)**

- [ ] Player **passes**; **other** players see the pass / correct turn indicator.
- [ ] The **passing player’s** UI does not update (no pass in trick area / wrong “whose turn” locally).
- [ ] **Refresh** on that player’s browser **fixes** the display.

**Why refresh fixing strongly suggests client-side**

The server is probably emitting a consistent state; one client’s **React state** or **last-applied version** is wrong until a full resync (`get-game-state` / `game-state` / hard reload).

### Likely client areas to read

| Area | File(s) | Notes |
|------|---------|--------|
| `game-update` handling | `frontend/src/App.jsx` (`onGameUpdate`) | Stale suppression: `incomingVersion <= lastAppliedServerStateVersionRef`. **Immediate apply** when `state !== 'waiting'` (play and all non-lobby phases) **or** `hasPlays \|\| playerWentOut`; **only lobby** batches via `pendingGameRef` + ~90ms. |
| `game-state` handler | `frontend/src/App.jsx` (`onGameState`) | Clears throttle timer + `pendingGameRef` before applying full snapshots (no longer returns early on pending). |
| Identity in active game | `frontend/src/App.jsx` | **`findMyPlayerInWireSnapshot`**: `socket.id` first, then `token`. |
| Normalization | `frontend/src/utils/normalizeGameState.js` | Ensures `passedPlayers` / `currentTrick` arrays exist. |

**Correction (do not assume “pass = slow path”):** While a trick is in progress, `currentTrick` usually still contains the lead play, so `hasPlays` is **true** and passes typically hit the **immediate** branch, **not** the throttle. The slow path applies when **`currentTrick` is empty and** the player has not gone out (e.g. between-trick transitions or other edge snapshots). Bug B may still involve throttle/races, but **not** because “pass” always means throttled.

### Hypotheses (unchecked until proven)

- [ ] **H-B1 — Stale `stateVersion` drop:** A `game-update` is ignored because `stateVersion` is not strictly increasing (duplicate or reorder). *Refresh* loads fresh state via `get-game-state`.
- [ ] **H-B2 — Throttle / pending / overwrite:** *(partially mitigated for play)* — lobby-only throttle; **still** verify if a rare lobby edge drops updates.
- [ ] **H-B3 — `onGameState` vs `onGameUpdate` race:** *(mitigated)* — `game-state` clears pending throttle before apply.
- [ ] **H-B4 — Clone worker / worker apply:** `pendingCloneApplyRef` or worker failure path leaves `lastApplied` advanced but **state not applied** for one tick (less likely if only one player affected).
- [ ] **H-B5 — Server emits correct state; client drops one snapshot:** *(partially mitigated)* — identity + throttle fixes; see H-B1 if still seen.

### Fix ideas (fill in as you learn)

| ID | Description | Status |
|----|-------------|--------|
| F-B1 | Opt-in `[game-sync]` console warnings for stale snapshot suppression + clone worker `requestId` mismatch (`VITE_DEBUG_GAME_SYNC` / `tichu_debug_game_sync`); see `frontend/.env.example` | Landed 2026-03-25 |
| F-B2 | | |

### Tests / repro checklist

- [ ] Reproduce with **4 real clients** or 4 tabs; note whether **only the passer** is wrong.
- [ ] In DevTools, log every `game-update` / `game-state`: `stateVersion`, `passedPlayers`, `currentTrick.length`, `currentPlayerIndex`, and whether the handler took **immediate** vs **throttled** path (`hasPlays`, `playerWentOut`) on the **buggy** client.
- [ ] Compare **buggy client** vs **working client** for the **same** server tick (same `stateVersion`): if payloads differ, suspect **generation/per-socket views**; if identical, suspect **apply** path only.
- [ ] Try **disabling** or narrowing the throttle path temporarily in dev to see if Bug B changes (narrows H-B2/H-B3 — optional; can affect performance).

---

## Shared follow-ups (both bugs)

- [ ] Confirm **Socket.IO** only delivers **one** `game-update` per logical change per client; no duplicate connection issues.
- [x] Document **`stateVersion` contract** — see [`STATE_VERSION_CONTRACT.md`](./STATE_VERSION_CONTRACT.md).
- [x] **Structured logging for pass** — optional `DEBUG_TICHU_PASS=1` on server (see Remaining work).

## Will fixing “Bug B hypotheses” break the game?

- **Not automatically.** The doc lists *candidates*; a real fix might be a **small, targeted** change (e.g. ordering of `lastApplied` vs apply, or clearing `pendingGameRef` in one edge case) with tests.
- **Risk** increases if you **broadly** remove throttling or version checks — those exist to reduce freezes and stale replays. Any change there needs **multi-player** validation.

## Will fixing “Bug A hypotheses” break the game?

- **Server rule changes** in `moveHandler.js` / `scoring.js` can fix real stuck states but can also **change Tichu rules** if done wrong (who wins a trick, who leads, when the round ends). Prefer **unit tests** that encode the intended rules, then fix code to match.

---

## References in repo

- Stale snapshot discussion: `docs/FINALLY_KILLING_THE_FREEZE_BUG.md`, `docs/FREEZE_BUG_FIX.md` (if present).
- **`stateVersion` contract:** [`STATE_VERSION_CONTRACT.md`](./STATE_VERSION_CONTRACT.md).
- Client throttle: `GAME_UPDATE_THROTTLE_MS` in `frontend/src/App.jsx`.
- Server broadcast: `broadcastGameUpdate` in `backend/server/socketHandlers.js`.

---

## Changelog

| Date | Change |
|------|--------|
| *(add rows as you go)* | |
| 2026-03-25 | Client: lobby-only `game-update` throttle; `game-state` flush pending; wire snapshot identity by `socketId`. |
| 2026-03-25 | Doc: Remaining work section; `STATE_VERSION_CONTRACT.md`; tailender unit tests; `DEBUG_TICHU_PASS` logging. |
| 2026-03-25 | `passWithPlayersOut` integration tests; `isPlayerOut()` in `moveHandler.js` for normalized `playersOut` membership. |
| 2026-03-25 | H-A4 persistence notes; `fullGame.test.js` bot fix (lead cannot pass). |
| 2026-03-25 | Client: opt-in `VITE_DEBUG_GAME_SYNC` / `localStorage` logging for stale `game-update`/`game-state` and clone worker races (H-B1/H-B4). |
| 2026-03-25 | Server: go-out + win-trick when all **active** opponents passed (not hard-coded 3); `passWithPlayersOut` regression (Bug A partial). |
