# Professional Game Dev Level Checklist (Crash-Proof + Desync-Proof)

## Quick issue + solution summary (what we fixed)
We were seeing intermittent “desync → UI almost crash / white screen” behavior that would recover after a moment and then let the game continue. The underlying cause was inconsistent end-of-round / trick-state transitions on the backend that briefly contradicted what the client expected to render.

Solution implemented:
- Updated `backend/game/scoring.js` round-ending logic (tailender + double-victory flows) so resolved trick state stays consistent during transitional states, and we don’t prematurely wipe/reinitialize at the wrong moment.
- Updated `backend/game/moveHandler.js` so `phoenixValue` is persisted on the canonical card objects stored in `game.currentTrick`.

This document is a repo-based checklist of what you still need to add to reach “professional-grade” robustness for a real-time / turn-based multiplayer card game.

It is built from: a full scan of the frontend socket + UI state plumbing, and a targeted deep read of backend socket handlers and the move/combination validation path. It focuses on preventing (1) desync cascading into crashes, and (2) “random bug → whole app breaks” behavior.

## Guiding principles (what pro teams actually optimize for)

1. **The server is authoritative; the client is a view.**
2. **All inbound data is untrusted.** Validate or sanitize before you touch it.
3. **Protocols must be ordered and idempotent.** Retries and duplicates happen.
4. **When the client detects inconsistency, it must recover automatically.**
5. **A crash should be isolated and recoverable, not a full blank screen.**
6. **Telemetry turns “random” into reproducible.**
7. **Tests + chaos scenarios prevent regressions.**

## What you already have (good baseline)

### Frontend

1. Defensive “freeze/crash” normalization:
   - `normalizeGameState()` in `frontend/src/App.jsx` caps/filters key arrays and enforces that `players`/`turnOrder`/`currentTrick`/`roundLog[].players` become arrays.
2. Clone worker:
   - `frontend/src/gameStateClone.worker.js` parses JSON off the main thread.
3. Render-loop guard and memory guard:
   - `RENDER_LOOP_*` and heap size reporting in `frontend/src/App.jsx`.
4. Error boundaries and recovery:
   - `RootErrorBoundary` (full-page refresh).
   - `GameErrorBoundary` with “Sync game” path.
   - `HandErrorBoundary` for isolating hand-specific crashes.
5. Client telemetry:
   - `frontend/src/clientErrorReport.js` reports `window.onerror` and `unhandledrejection`.
6. Some UI hardening in `GameBoard.jsx`:
   - selection validation before emitting a play
   - safe defaults passed into list-rendering subcomponents (`HandDock`, `Trick`)

### Backend

1. Player-view sanitization:
   - `backend/game/playerView.js` hides other players’ hands and maps tokens to stable ids.
2. Payload bounding:
   - `backend/game/capGameForWire.js` caps `roundLog`, `trickHistory`, hands, and stacks.
3. Basic authoritative move validation:
   - `backend/game/moveHandler.js` checks phases, turn ownership, and combination validity.
4. Combination validation logic exists:
   - `backend/game/combinations.js` validates many combo types and compares them.
5. Error ingestion for client errors:
   - `/api/client-error` in `backend/server.js`.

## Remaining gaps to reach professional-grade robustness

The checklist below is organized by “where it breaks” in multiplayer games: protocol boundary, authoritative transitions, client rendering stability, and recovery/observability.

---

## A. Protocol boundary hardening (client + server)

### A1. Add strict schema validation for every socket inbound event (highest priority)

**Problem observed in this repo:** Backend socket handlers destructure/assume payload shapes (e.g. `make-move` destructuring `cards`, `action`, `mahJongWish`; `exchange-cards` accepts `cards` directly). Combination validation and move handling assume card objects have fields like `rank`, `suit`, `name`, `type`.

**Professional requirement:**

1. Define an explicit payload schema for every event:
   - `create-game`
   - `create-test-game`
   - `join-game`
   - `leave-game`
   - `start-game`
   - `update-player-name`
   - `set-player-team`
   - `randomize-teams`
   - `reveal-remaining-cards`
   - `declare-tichu` / `undeclare-tichu`
   - `declare-grand-tichu` / `undeclare-grand-tichu`
   - `exchange-cards`
   - `completeExchange` (if exposed)
   - `make-move`
   - `select-dragon-opponent`
   - `get-game-state`
   - `rejoin`
2. Validate *types and shape* before calling game logic.
3. Validate `cards` as:
   - must be an array
   - each element must be a valid card object
   - optionally restrict max length and reject undefined elements

**Acceptance criteria**
- Malformed payloads never cause exceptions in game logic.
- Server returns structured `error` responses (“invalid_payload”) instead of crashing or producing inconsistent state.

### A2. Add strict schema validation for every socket outbound snapshot

**Problem:** “cap” is array-bound but not type-bound; a malformed state could still leak through.

**Professional requirement**
1. Validate that `getPlayerView()` output matches the client snapshot shape.
2. Enforce stable types for:
   - `players` array elements
   - `hands` keys and values
   - `turnOrder` structure
   - `currentTrick` play objects shape
   - `roundLog[].players` structure

**Acceptance criteria**
- Client normalization can be simpler because server never violates basic invariants.

### A3. Add monotonic `stateVersion` or server sequence number

**Problem:** Current ordering is heuristic (`pendingGameRef.current` and clone request id). There’s no protocol-level guarantee for ordering across all event types.

**Professional requirement**
1. Add `game.stateVersion` (or `updateSeq`) on the server.
2. Include it in all snapshots and broadcasts (`game-update`, `game-state`, potentially `player-won-round`, `trick-won`).
3. Client applies only if `incoming.version >= lastAppliedVersion`.

**Acceptance criteria**
- Out-of-order packets can’t “rewind” the client into an inconsistent state.

### A4. Add action id / idempotency for player commands

**Problem:** Double-clicks and network retries lead to duplicates. Right now the server has no `actionId` to dedupe, so duplicates can cause surprising behaviors.

**Professional requirement**
1. Client generates `actionId` (uuid or incrementing nonce) per emitted command:
   - `make-move` (idempotent)
   - `exchange-cards`
   - declarations
   - `select-dragon-opponent`
2. Server keeps a short-lived dedupe store:
   - key `(gameId, playerId, actionId)` → result success/failure + resulting `stateVersion`
3. Server replies with a structured ack:
   - `accepted` with resulting `stateVersion` OR `rejected` with reason

**Acceptance criteria**
- Duplicate emits never advance state twice.

---

## B. Authoritative state machine + invariant checks

### B1. Add global invariant verification around state transitions

**Problem:** Even with validations, some invalid state combinations can slip through and crash downstream rendering or subsequent validations.

**Professional requirement**
1. Add `validateGameInvariant(game)` on the server:
   - before applying a move
   - after applying a move
2. Verify coherence:
   - phase matches allowed fields
   - `turnOrder` length and player ids consistency
   - `currentPlayerIndex` is valid
   - `hands[playerId]` shape and max sizes
   - `currentTrick` plays array shape
   - `passedPlayers` is an array of ids
3. If an invariant fails:
   - do not broadcast a broken state
   - emit an error and log (and optionally force resync)

**Acceptance criteria**
- No broadcast of structurally invalid game state.

### B2. Harden card combination validation input shape

**Problem observed:** `backend/game/combinations.js` reads `card.type`, `card.rank`, `card.name` directly without verifying each card element is a valid card object.

**Professional requirement**
1. At the start of `validateCombination(cards)`:
   - ensure `cards` is an array
   - ensure every element has required fields and valid values
2. Optionally reject unknown card shapes early with clear error reasons.

**Acceptance criteria**
- Malformed card elements can’t throw.

### B3. Ensure move handler never assumes fields exist on `game`

**Problem:** Many accesses in `moveHandler.js` assume arrays exist (`game.passedPlayers`, `game.hands[playerId]`, `game.firstCardPlayed`, etc.). Some guards exist, but not comprehensively.

**Professional requirement**
1. Normalize/initialize game fields in a single server entry point (one function that creates defaults).
2. Ensure critical arrays exist:
   - `passedPlayers` defaults to `[]`
   - `playerStats`, `firstCardPlayed` defaults to objects
   - `hands` defaults to `{}` and each player has an array
3. Add invariant check as in B1.

**Acceptance criteria**
- No `undefined` reads in normal gameplay even if some fields were missing due to prior bugs.

---

## C. Client stability and crash recovery

### C1. Treat all inbound snapshot data as untrusted

You already do `normalizeGameState`. To be professional:
1. Validate critical scalar types, not just “array-ness”.
2. Validate `currentTrick` play objects shape.
3. Validate `turnOrder` items shape (must contain `id`).
4. Validate `hands` entries are arrays of valid card objects (or sanitize to empty).

**Acceptance criteria**
- No render code sees structurally invalid state even transiently.

### C2. Automatic resync on “likely desync” conditions

You added guard rails for a specific desync path (empty hand + play enabled).

Professional requirement:
1. Define “desync detectors” (examples):
   - selected cards not in hand
   - selected cards length > hand length
   - `currentPlayer` id not present in `turnOrder`
   - `currentTrick` exists but player view cannot reconcile it
2. Auto-trigger `get-game-state` or `onResync` with a backoff (avoid infinite loops).

**Acceptance criteria**
- Random desync resolves automatically without requiring the second click or manual Sync in common cases.

### C3. Replace dev-only StrictMode socket workaround with a deterministic pattern

**Problem in this repo:** Dev workaround (“skip removing socket handlers on the first cleanup”) is effective but fragile.

Professional requirement:
1. Move all socket listener registration into a singleton module with explicit `start()`/`stop()` semantics.
2. Ensure it’s safe under Strict Mode remount behavior in dev and safe under real unmount in prod.

**Acceptance criteria**
- No reliance on “cleanup count” hacks.
- No handler duplication in dev.

### C4. Isolate and harden all render-list boundaries

You already hardened `GameBoard.jsx` and caps.

Professional requirement:
1. Ensure every component that renders lists uses:
   - `Array.isArray(...)` guards
   - safe defaults
2. Ensure every component that expects card objects validates minimum fields.

**Acceptance criteria**
- No `.map` / `.find` / `.filter` on unknown shapes in production code.

---

## D. Server-side robustness: never let handlers crash the process

### D1. Wrap every socket handler in try/catch and send structured errors

**Observed risk:** `backend/server/socketHandlers.js` contains many event handlers calling into game logic. Not every handler is wrapped in try/catch, so a thrown exception can crash the handler or destabilize the server.

Professional requirement:
1. For every socket event:
   - `try { ... } catch (err) { log; socket.emit('error', { code, message, details }) }`
2. Add a consistent error format:
   - `code` (e.g. `invalid_payload`, `not_turn`, `internal_error`)
   - `message` (user-safe)
   - `details` (server logs only)

**Acceptance criteria**
- No unhandled exceptions from socket events.

### D2. Cancel and cleanup any pending timeouts/loops

**Observed risk:** bots/test timers (using `setTimeout`) should be tracked and cleared when games end or players disconnect unexpectedly.

Professional requirement:
1. Track timeout handles in game state or a per-game map.
2. Cancel them on:
   - `game ended`
   - `game deleted`
   - `player disconnect storm` (optional but recommended)

**Acceptance criteria**
- No timer leak or unintended move after a game changes state.

---

## E. Telemetry and debugging: make “random” reproducible

### E1. Add structured logging and correlation ids everywhere

Current state:
1. `clientErrorReport.js` reports errors with `source/message/stack`.
2. Server logs `client-error` payloads to terminal.

Professional requirement:
1. Introduce correlation ids:
   - `requestId` for every client action
   - include it in the server logs and the response
2. Include these fields on every log:
   - `gameId`, `playerId`, `socketId`
   - `eventName`
   - `stateVersion`
   - `actionId`
   - severity

**Acceptance criteria**
- You can answer: “what event caused the crash and what state was it in?”

### E2. Add metrics: rates of rejected moves, resync triggers, invalid payloads

Professional requirement:
1. Emit stats:
   - invalid_payload_rejected count
   - move_rejected reason distribution
   - desync_detected count
   - resync_performed count
2. Store in memory and print periodic summaries or send to a metrics endpoint.

**Acceptance criteria**
- You can see if the crash problem correlates with a specific rejection reason.

---

## F. Testing strategy (unit + integration + chaos)

### F1. Expand frontend test coverage for normalization + render safety

Professional requirement:
1. Unit tests:
   - `normalizeGameState` with malformed payloads
   - `cardMatches` and selection logic invariants
   - HandDock/Trick never throw with missing arrays
2. Integration tests:
   - simulate socket events (game-created → started → make-move → state update) and assert no throws

**Acceptance criteria**
- “Random crash” becomes a test failure at the unit boundary.

### F2. Add socket protocol integration tests on the backend

Professional requirement:
1. Spin up socket server in test mode.
2. Use a socket client to:
   - send malformed payloads
   - send duplicates (same actionId)
   - send out-of-order snapshots
   - disconnect and reconnect mid-trick
3. Assert:
   - server never throws
   - client receives recoverable errors
   - stateVersion ordering prevents rewinds

**Acceptance criteria**
- Protocol-level correctness is verified, not just “happy path.”

### F3. Chaos tests for desync

Professional requirement:
1. Inject:
   - cards containing undefined fields
   - wrong `action` strings
   - wrong `mahJongWish` type
2. Force out-of-order arrival:
   - deliver old `game-update` after new one
3. Verify auto-resync triggers.

**Acceptance criteria**
- The system recovers without full UI crash.

---

## G. Operational readiness (production concerns)

### G1. Protect server from abusive clients

Professional requirement:
1. Add rate limits per socket for:
   - `make-move`
   - declarations
   - `get-game-state`
2. Optional: limit payload size and reject huge card arrays.

**Acceptance criteria**
- Malicious payload can’t crash server or degrade performance.

### G2. Backwards compatibility / versioning of protocol snapshots

Professional requirement:
1. Add protocol version field `protocolVersion` in snapshots.
2. If client/server versions mismatch, client triggers resync and shows a compatible UI message.

**Acceptance criteria**
- Deploys don’t lead to unrecoverable desync.

---

## Implementation order (recommended)

1. **Protocol validation** (A1) and **server try/catch** (D1).
2. **State versioning** (A3) and **idempotent action ids** (A4).
3. **Invariant checks** (B1/B2) and **initialize defaults** (B3).
4. **Client auto-resync detectors** (C2) and ensure normalization validates more than “array-ness” (C1).
5. **Telemetry correlation ids** (E1/E2).
6. **Testing + chaos** (F1/F2/F3).
7. **Operational protections** (G).

---

## Prioritized Implementation Plan (P0–P3)

This is a practical backlog prioritization aimed at minimizing “random desync -> crash” and “random bug -> everything breaks” with the least risky refactors first.

### P0 (Do first; highest impact, lowest refactor risk)
1. **Server-side isolation for every socket handler (D1)**  
   Wrap each socket event handler body in `try/catch` and emit structured errors (`code`, `message`, `details`) so malformed inputs never destabilize the server or leave partial state.
2. **Harden card/action input shape at the game-logic boundary (A1 + B2)**  
   Make sure `validateCombination(cards)` and any downstream combination/comparison logic can never throw if `cards` contains malformed elements.
3. **Never broadcast invalid snapshots (B1)**  
   Add a single server invariant check right before emitting `game-update` / `game-state`. If it fails: do not broadcast; send an error and/or trigger `get-game-state` recovery.
4. **Automatic resync for the most common desync symptoms (C2)**  
   Extend your existing UI validation so when you detect “likely desync” (e.g. selected cards not in hand; `currentPlayer` missing; trick shape mismatch), you trigger `get-game-state` with backoff automatically.

### P1 (Next; makes protocol behavior robust long-term)
1. **Monotonic `stateVersion` on the server (A3)**  
   Include it in all `game-update` / `game-state` payloads and have the client only apply newer versions.
2. **Idempotent player commands with `actionId` (A4)**  
   Dedupe duplicates on the server and return acknowledgements that tie back to the action.
3. **Only after verifying: refactor dev listener lifecycle (C3)**  
   Replace the “cleanup count” workaround with deterministic listener singleton semantics so dev never causes handler gaps/duplication.

### P2 (Stability + debuggability)
1. **Structured telemetry with correlation ids (E1/E2)**  
   Add a consistent `requestId` / `actionId` to every command and ensure server logs include it.
2. **Frontend unit tests for normalization/render safety (F1)**  
   Lock in behavior so malformed payloads never crash UI.
3. **Backend socket integration tests (F2)**  
   Verify malformed payload rejection, reconnect flows, and ordering behavior.

### P3 (Operational + confidence)
1. **Rate limiting + payload caps (G1)**
2. **Protocol versioning/backwards compatibility (G2)**
3. **Chaos harness (F3)**  
   Inject malformed card objects, duplicate actions, and out-of-order snapshot delivery.

---

## Progress Snapshot (Current Codebase)

Legend: `[x]` done, `[~]` partially addressed, `[ ]` not yet.

### P0
1. `[x]` Server-side isolation for every socket handler (`D1`) — all socket handlers in `backend/server/socketHandlers.js` are now wrapped by `safeSocketOn` and convert thrown exceptions into structured `error` emits.
2. `[x]` Harden card/action input shape at the game-logic boundary (`A1 + B2`) — server `backend/game/combinations.js` and `backend/game/exchange.js` now validate card element shape and reject malformed payloads without throwing.
3. `[x]` Never broadcast invalid snapshots (`B1`) — server now sanitizes a wire-safe snapshot via `sanitizeWireSnapshot()` before emitting `game-update` / `game-state`.
4. `[x]` Automatic resync for the most common desync symptoms (`C2`) — implemented via automatic “selected cards disappeared from hand” detection in `GameBoard.jsx` and exponential-backoff throttled resync requests in `App.jsx` (loop prevention).

### P1
1. `[x]` Monotonic server `stateVersion` (`A3`) — added server-side monotonic `stateVersion` and client suppression of stale snapshots via `lastAppliedServerStateVersionRef`.
2. `[x]` Idempotent player commands with `actionId` (`A4`) — client sends `actionId` for player commands and server dedupes duplicates.
3. `[x]` Deterministic dev listener lifecycle singleton (`C3`) — replaced the DEV-only cleanup workaround with a deterministic singleton listener registry (`frontend/src/socketEventRegistry.js`) using reference-counted subscribe/unsubscribe safe under StrictMode.

### P2
1. `[x]` Structured telemetry with correlation ids (`E1/E2`) — added requestId/actionId propagation for socket commands and correlation-aware server/client error logging.
2. `[x]` Frontend unit tests for normalization/render safety (`F1`) — added Vitest + unit tests for `normalizeGameState` safety/capping.
3. `[x]` Backend socket integration tests (`F2`) — added Socket.IO integration coverage for duplicate `actionId` dedupe (multiple event types) and malformed payload error handling.

### P3
1. `[x]` Rate limiting + payload caps (`G1`) — added server-side incoming rate limiting for `make-move`, declaration events, and `get-game-state`, plus an incoming `make-move.cards` size cap.
2. `[x]` Protocol versioning/backwards compatibility (`G2`) — added `protocolVersion` to server snapshots and client mismatch-triggered resync UI.
3. `[x]` Chaos harness (`F3`) — added backend Socket.IO chaos/injection integration test to ensure server survives malformed/duplicate/oversized payloads.

### Rendering / crash isolation (from the “Do Not Miss” checklist)
1. `[x]` List rendering safe defaults (`C4`) — hardened remaining list-rendering paths (e.g. `Hand.jsx`, `GameInfo.jsx`, `StatsPopup.jsx`, and `handOrderOverride` safety in `GameBoard.jsx`).
2. `[x]` Action UI never enables invalid moves due to stale selection state — ensured play selection validation and removed declaration reliance on stale optimistic state.

---

## Full Implementation Checklist (Do Not Miss)

Use this as your “definition of done.”

### Socket protocol boundary (client + server)
1. [x] Every inbound socket event has schema/type validation before any game logic runs (A1).
2. [x] Every socket handler is wrapped in `try/catch` with structured error responses (D1).
3. [x] `validateCombination` (and any combination parsing/compare helpers) is card-element-shape safe and never throws (A1 + B2).
4. [x] Server enforces “never broadcast invalid snapshots” via invariants/sanitization before `game-update` / `game-state` (B1).

### Ordering, idempotency, recovery
1. [x] Server includes monotonic `stateVersion` and client applies only newer versions (A3).
2. [x] Client commands include `actionId`; server dedupes and returns consistent reject on duplicates (A4).
3. [x] Client auto-resync triggers exist for “likely desync” with backoff and loop prevention (C2).
4. [x] Reconnect/resync flow is deterministic (token rejoin, fallback to `get-game-state`).

### Rendering stability
1. [x] All list rendering paths use `Array.isArray` + safe defaults (C4).
2. [x] No render-time `.map/.filter/.find` assumes missing fields.
3. [x] Action UI never enables invalid moves based on stale hand/selection state.

### Observability + testing
1. [x] Correlation ids (`requestId` / `actionId`) included in client logs and server logs (E1).
2. [x] Metrics exist for invalid payloads, rejected moves, desync detections, and resyncs (E2).
3. [x] Frontend tests cover normalization and “never throw on malformed state” (F1).
4. [x] Backend socket integration tests cover malformed payloads, duplicates, reconnects, ordering (F2).
5. [x] Chaos scenarios exist to reproduce random-seeming failures (F3).

### Operational readiness
1. [x] Rate limits and payload size caps exist for high-frequency events (G1).
2. [x] Protocol snapshot versioning exists (G2).

---

## Quick “do not miss anything” audit checklist (printable)

For each socket event:
1. [x] Validate inbound payload schema.
2. [x] Wrap handler in try/catch; never crash on malformed data.
3. [x] Confirm authoritative move logic never throws with malformed card elements.
4. [x] Use idempotency (`actionId`) for player actions.
5. [x] Emit structured success/error with `stateVersion`.

For each server broadcast:
1. [x] Validate snapshot structure/type.
2. [x] Include `stateVersion` monotonic increments.
3. [x] Never broadcast states failing invariants.

For each client apply:
1. [x] Apply only if `incoming.stateVersion` is monotonic.
2. [x] Auto-resync if invariant detector triggers.
3. [x] Ensure UI rendering never receives unknown shapes (safe defaults everywhere).

For observability:
1. [x] Add correlation ids to every action and server log.
2. [x] Record invalid payload rates, desync triggers, resync counts.

