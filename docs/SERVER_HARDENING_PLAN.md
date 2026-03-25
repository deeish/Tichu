# Server hardening plan (Render paid Starter / production)

**Deployment assumption:** the Tichu backend runs on **Render’s paid Starter** web service (not the free instance type): always-on for normal use, no 15-minute idle spin-down.

This doc is a **backend- and hosting-focused** backlog for that setup. It complements `docs/FRONTEND_BACKEND_STABILITY_NOTES.md`, which tracks protocol/desync/client work.

## Scope: what this plan is *not* duplicating

The following are **already implemented** in this repo (see `FRONTEND_BACKEND_STABILITY_NOTES.md` “Progress Snapshot” / checklist). This hardening plan does **not** re-list them as open work unless we discover a hole:

- Socket handlers wrapped with **`safeSocketOn`** (handler exceptions → structured `error` emit + server log).
- **Rate limits** on high-frequency gameplay events (e.g. `make-move`, declarations, `get-game-state`).
- **`capGameForWire` + `sanitizeWireSnapshot`** before broadcasting snapshots.
- **`stateVersion` monotonic bumps** in `broadcastGameUpdate`, **`actionId` deduping**, and related integration tests.

**This document focuses on:** process lifecycle, silent failure paths, memory leaks, HTTP surface, observability, and cleanup edges that can still bite a **long-lived** Starter instance or confuse clients after reconnect/deploy.

**How to read the older sections:** The tables in **§P0–§P3** (and **§P2c**) are the original backlog / risk register. They are **not** all “still broken.” Treat **§Recently implemented** + the **§Coverage checklist** as the live status; use the tables for context and for anything not listed as shipped.

## Recently implemented (codebase)

The following items from this plan are **implemented in code** (verify against git history):

- **P0:** `get-game-state` emits `error` with `code: 'not_in_game' | 'game_not_found'`; **`rejoin`** calls `broadcastGameUpdate` before the private `game-state`; **`disconnect`** falls back to `playerInfo.playerId` when `socketId` mismatch; **`players` map** stores `playerId` for that path.
- **P2:** **`client-metric`** no longer passes `requestId` into `metricsStore` keys (bounded cardinality); rate limits on **`client-metric`**, **`client-error`** (socket), and **`chat-message`**; **`simpleRateLimiter`** prunes stale keys periodically and enforces **`maxEntries`**; **`metricsStore`** enforces **`maxKeys`** with **LRU-style** eviction (each `inc` refreshes key order; least-recently-updated keys dropped when over cap).
- **P2:** **`releaseGameResources`** on empty lobby clears version counter, throttle timer, and action deduper for that `gameId`; throttle callback skips emit if game removed from `games`.
- **P1:** **`gameManager`** test-player `setTimeout` bodies wrapped in try/catch + log.
- **P1:** **`server.js`** — `GET /health`, `express.json({ limit: '48kb' })`, **`uncaughtException` / `unhandledRejection`** logging.
- **P2b:** **`http.Server`** — **`requestTimeout`** + **`headersTimeout`** (env: **`HTTP_REQUEST_TIMEOUT_MS`**, **`HTTP_HEADERS_TIMEOUT_MS`**) so stalled HTTP requests don’t tie up the process; Socket.IO upgrades complete as normal HTTP requests first.
- **P5 (baseline):** Socket.IO **`pingTimeout`** default **45s** and **`pingInterval`** **25s** in `server.js`, overridable via **`SOCKET_IO_PING_TIMEOUT_MS`** / **`SOCKET_IO_PING_INTERVAL_MS`** (see `DEPLOY.md`).
- **Frontend:** `App.jsx` **`onError`** clears rejoin creds on `not_in_game`, `game_not_found`, `invalid_rejoin_token`, `already_in_game`, plus legacy string matches.
- **Deploy:** `DEPLOY.md` notes **`/health`**, paid Starter, optional Socket.IO / HTTP timeout / **Redis (`REDIS_URL`)** env vars, link to this doc.
- **P4 (optional):** With **`REDIS_URL`**, `backend/server/gamePersistence.js` snapshots games to Redis (debounced) and **`server.js`** restores them on startup; players are normalized to **disconnected** so **`rejoin`** + token works. Test / bot games are **not** persisted. If Redis is unavailable at boot, the process continues without snapshots.

**Still open (by design / optional):** further **P5** tuning; multi-instance / horizontal scale (single Redis + one Node process is the expected Starter setup).

**Also done:** **Graceful shutdown** (`SIGTERM` / `SIGINT`) in `server.js` — `server.close`, disconnect sockets, 12s forced exit fallback. **P2c:** in-game handlers, **`join-game` / `rejoin`** structured error codes; lobby **`set-player-team` / `randomize-teams`** use **`wrong_phase`** where appropriate. **Tests:** `getGameStateErrors`, `gameplayHandlerPrechecks`, `joinRejoinErrors`, `simpleRateLimiter`, `metricsStore`, **`gamePersistence`** unit tests.

## What paid Starter fixes vs. what it does not

Relative to **Render free** web services, **paid Starter** avoids the worst of:

- **15-minute idle spin-down** and the “everyone dropped at once, then `npm start` again” pattern that was tied to sleep/wake on free tier.

**Not fixed by Starter (or any single small instance) alone:**

- **Deploys and platform restarts** still restart the Node process → all Socket.IO connections drop and **in-memory** `games` / `players` are empty until new rooms are created.
- **OOM / crash** if the process throws outside guarded handlers (see below) or memory grows without bound.
- **Operational limits** (CPU, RAM, connection count) — Starter is fine for ~10 concurrent users for this stack, but unbounded in-memory growth still hurts.

## P0 — Correctness and “silent failure” paths

These directly affect “server feels broken” after reconnect, resync, or partial state.

| Issue | Where | Risk | Direction |
|-------|------|------|-----------|
| **`get-game-state` returns nothing** | `backend/server/socketHandlers.js` | If `players.get(socket.id)` or `games.get(gameId)` is missing, the handler **returns without emitting**. Clients keep retrying; UX looks frozen. | Emit structured `error` (e.g. `code: 'not_in_game'`, `code: 'game_not_found'`) with `requestId` when known. |
| **`rejoin` snapshot vs `stateVersion`** | Same file, `rejoin` | Server emits `game-state` **before** `broadcastGameUpdate` bumps `game.stateVersion`. Client may **ignore** that `game-state` as “stale” if `stateVersion` is unchanged vs last applied. | Call `broadcastGameUpdate` first (or bump version before single-player `game-state`), or ensure rejoin `game-state` always carries a **new** `stateVersion`. |
| **Disconnect does not always mark `disconnected`** | `disconnect` handler | Player is only updated if `game.players.find(x => x.socketId === socket.id)`. If `socketId` is out of sync, rejoin can get **`Already in game`** while the UI still shows problems. | Resolve player via `players` map + stable id, or fallback scan; add logging when `playerInfo` exists but no player row matches. |

## P1 — Process safety (crashes and deploys)

| Issue | Where | Risk | Direction |
|-------|------|------|-----------|
| **Uncaught errors in timers** | `backend/server/gameManager.js` | `setTimeout` around test-player Grand Tichu automation is **not** wrapped in `safeSetTimeout`. A throw in a timer callback can **crash Node** and drop every client. | Wrap callback in try/catch + log; reuse `safeSetTimeout` pattern from `socketHandlers.js` or centralize timer helper. |
| **No top-level crash hooks** | `backend/server.js` | No `uncaughtException` / `unhandledRejection` logging → harder to diagnose prod crashes from Render logs. | Log + optional metrics; avoid `process.exit` except after fatal err if you add a supervisor. |
| **No graceful shutdown** | `backend/server.js` | On SIGTERM (deploy), open sockets die abruptly; optional improvement is `server.close` + `io.close` with a short drain timeout. | Nice-to-have for cleaner client disconnect reasons. |

## P2 — Memory and leaks (long-running Starter instance)

| Issue | Where | Risk | Direction |
|-------|------|------|-----------|
| **Metrics key cardinality** | `backend/server/metricsStore.js` + `client-metric` handler | `inc(name, value, extra)` builds keys with `JSON.stringify(extra)`. The frontend sends **unique `requestId`** per `resync_requested` (`frontend/src/App.jsx`), so **each resync adds a new Map key** → **unbounded growth** over days/weeks. | Omit `requestId` from the counter key; bucket by `reason` only, or use fixed low-cardinality labels; optionally cap map size or prune old keys. |
| **Per-game throttle / version maps** | `gameUpdateThrottle`, `gameStateVersionCounter` in `socketHandlers.js` | When `games.delete` runs (empty lobby), counters/throttle entries for that `gameId` may **linger** if a pending timer exists or logic paths skip cleanup. | On final `games.delete(gameId)`, clear `gameStateVersionCounter`, cancel `gameUpdateThrottle` timer, delete entry. |
| **Action deduper** | `backend/server/actionDeduper.js` | Per-game maps prune on access; low risk but **orphan `gameId` keys** if never touched again. | On game delete, remove `byGame` entry for that id (optional hygiene). |
| **Throttle timer vs deleted game** | `broadcastGameUpdate` + `gameUpdateThrottle` | A pending **`setTimeout`** may still run after `games.delete(gameId)` if cleanup is incomplete, briefly emitting updates for a game no longer in `games` (or holding references). Tighten with P2 cleanup + guard inside the timer callback (`if (!games.has(gameId)) return`). |
| **`client-metric` spam** | `socketHandlers.js` `client-metric` | **No rate limiter** today. A buggy client (or abuse) can flood metrics + log lines; pairs badly with metrics key cardinality until fixed. | Add a fixed-window limiter per socket (similar to `get-game-state`). |
| **Socket `client-error` spam** | `socketHandlers.js` `client-error` | **No rate limiter**; huge stacks in payload → log volume / CPU. | Rate-limit per socket; optionally truncate stack length in logs. |
| **`chat-message` spam** | `socketHandlers.js` `chat-message` | **No rate limiter**; a client can flood the room with broadcasts → CPU + bandwidth + noisy clients. | Per-socket (and optionally per-game) fixed-window limit, similar to `make-move`. |
| **`simpleRateLimiter` Map growth** | `backend/server/simpleRateLimiter.js` | Keys are `socketId:eventName`. Entries are only **replaced** when the same key is used again after the window; **dead socket ids never expire** if no further events use that key → **unbounded Map growth** over long run / many unique visitors. | Periodic prune of entries whose `resetAt < now` and optionally cap map size; or LRU-style limiter. |

## P2b — HTTP surface (`server.js`)

| Issue | Risk | Direction |
|-------|------|------------|
| **`express.json()` default body limit** | `/api/client-error` accepts arbitrary JSON; oversized bodies waste memory / can be abused. | Use `express.json({ limit: '32kb' })` (or similar) and reject with 413. **Shipped:** `48kb` limit in `server.js`. |
| **No request timeouts** | Long-running slow HTTP phases tie up workers; health/error should stay cheap. | **Shipped:** `server.requestTimeout` + `server.headersTimeout` with env overrides (`HTTP_REQUEST_TIMEOUT_MS`, `HTTP_HEADERS_TIMEOUT_MS`); keeps handlers minimal. |

## P3 — Hosting / Render hygiene

| Item | Notes |
|------|------|
| **Health check** | **`GET /health`** in `backend/server.js` returns `200` + `{ ok: true, persistRedis: boolean }` (`persistRedis` is `true` only when Redis snapshots are enabled and connected). |
| **`DEPLOY.md`** | Paid Starter vs free spin-down, `/health`, **`FRONTEND_ORIGIN`**, optional Socket.IO env vars; link to this doc — keep in sync if hosting changes. |
| **`FRONTEND_ORIGIN`** | Lock CORS to Vercel origin in production (documented in `DEPLOY.md`). |
| **Render health check path** | Point Render’s health check at **`/health`** (optional but recommended). |

## P2c — Socket handler “silent return” audit (UX / supportability)

Many handlers **`return`** without `socket.emit('error')` when preconditions fail (e.g. `set-player-team` / `randomize-teams` when `!playerInfo` or wrong phase). That is **not** a server crash issue, but it **is** a support issue: the client gets no feedback.

| Direction | Details |
|-----------|---------|
| Audit | Grep for `if (!playerInfo) return` / early `return` in `socketHandlers.js` and decide which deserve **structured errors** vs intentional no-ops. |
| Prioritize | Lobby-only actions (`set-player-team`, `randomize-teams`) and **in-game** actions differ; in-game should almost always emit an error or ack. |

This overlaps with `FRONTEND_BACKEND_STABILITY_NOTES.md` §A1 (schema validation); server hardening is about **observable outcomes** when validation says “no.”

## P5 — Optional Socket.IO / Node tuning

**Baseline (implemented):** `backend/server.js` sets **`pingTimeout` 45s** and **`pingInterval` 25s** by default (vs Engine.IO’s tighter defaults), with env overrides — see `DEPLOY.md`. Further changes only if logs show disconnect issues.

| Knob | When to touch |
|------|----------------|
| `maxHttpBufferSize` | If you ever allow very large custom payloads (you already cap card arrays on `make-move`). |
| `pingTimeout` / `pingInterval` | After measuring: raise/lower via **`SOCKET_IO_PING_TIMEOUT_MS`** / **`SOCKET_IO_PING_INTERVAL_MS`** if needed. |
| **Node memory** | If heap grows, heap snapshots + **metrics cardinality** fix (P2) first. |

## P4 — Real recovery after restarts (optional product decision)

**Implemented (optional):** set **`REDIS_URL`** → `createGameplayPersistence` in **`server/gamePersistence.js`** writes JSON snapshots (`tichu:game:<id>`) and **`server.js`** loads them before Socket.IO starts. **`players`** Map stays empty until clients connect; restored **`game.players`** have **`socketId: null`** and **`disconnected: true`** so **`rejoin`** works. Without **`REDIS_URL`**, behavior is unchanged (RAM-only).

**Limits:** one Node process + one Redis is assumed; **no** cross-server presence or CRDT. **Postgres / KV** or richer “session expired” UX remain future options if needed.

## Suggested implementation order

1. **P0** — Structured errors for `get-game-state`; fix `rejoin` / `stateVersion` ordering; harden disconnect → `disconnected` flag.
2. **P2** — Fix **metrics cardinality** (quick win for long-lived Starter).
3. **P2** — Rate-limit **`client-metric`** / **`client-error`**; add **`express.json` limit** (P2b).
4. **P1** — Safe timers in `gameManager.js`; optional uncaught hooks in `server.js`.
5. **P2** — Cleanup throttle/version/deduper maps on game removal; guard throttle callback after delete.
6. **P3** — `/health` + Render health check URL.
7. **P2c** — Silent-return audit (errors to client where helpful).
8. **P4** — Optional **`REDIS_URL`** snapshots (see **§P4** and `gamePersistence.js`).
9. **P5** — Baseline ping tuning in `server.js`; optional follow-up if telemetry shows connection issues.

## Coverage checklist (against this repo)

Use this to confirm the plan stays complete after refactors:

- [x] **HTTP:** `server.js` — `express.json` limit (`48kb`), `GET /health`, **HTTP `requestTimeout` / `headersTimeout`**, crash hooks, graceful shutdown, `/api/client-error` stack truncation.
- [x] **Sockets:** `socketHandlers.js` — structured errors for `get-game-state`, `rejoin`, gameplay prechecks, join/rejoin codes, `disconnect` + resources cleanup, observability rate limits.
- [x] **Timers:** `gameManager.js` — test-player `setTimeout` callbacks wrapped in **try/catch** + log (mitigation per P1; not the same helper as socket `safeSetTimeout`).
- [x] **Memory:** `metricsStore.js`, `actionDeduper.js`, throttle/version Maps — bounded keys + cleanup on `games.delete`.
- [x] **Rate limiter internals:** `simpleRateLimiter.js` — prune + `maxEntries` cap.
- [x] **Chat / observability spam:** `chat-message`, `client-metric`, `client-error` — per-socket limits + log truncation on socket + HTTP client-error.
- [x] **Deploy narrative:** `DEPLOY.md` — Starter vs free, `/health`, CORS, optional Socket.IO env vars, link to this doc.
- [x] **Tests:** Integration tests for `get-game-state`, gameplay prechecks, join/rejoin errors; unit tests for rate limiter + metrics store.
- [x] **Socket.IO baseline:** `server.js` — configurable `pingTimeout` / `pingInterval` (see P5).
- [x] **Optional game persistence:** `REDIS_URL` + `gamePersistence.js`; `/health` exposes `persistRedis` when connected.

## Related docs

- `docs/FRONTEND_BACKEND_STABILITY_NOTES.md` — client/server protocol, idempotency, sanitization (much of this is already implemented; use as cross-check).
- `docs/DEPLOY.md` — env vars and Render/Vercel wiring.
