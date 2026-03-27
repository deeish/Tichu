# `stateVersion` contract (server ↔ client)

## Server

- Each call to **`broadcastGameUpdate(io, game, games)`** in `backend/server/socketHandlers.js` increments a per-game counter and sets **`game.stateVersion`** to that value before emitting **`game-update`** per connected player.
- Handlers that emit **`game-state`** directly must also bump **`stateVersion`** (or use `broadcastGameUpdate`) so clients do not treat snapshots as stale.

## Client

- **`lastAppliedServerStateVersionRef`** in `frontend/src/App.jsx` tracks the latest **`stateVersion`** applied from **`game-update`** or **`game-state`**.
- Incoming **`game-update`** / **`game-state`** with **`stateVersion <= lastApplied`** is **ignored** (stale suppression).
- Therefore every **logical** state change visible to clients should carry a **strictly increasing** `stateVersion` on the wire.

## Operational notes

- Duplicate or out-of-order `stateVersion` values can cause **dropped** updates (UI looks behind until refresh/resync).
- Lobby-only `game-update` throttling applies only when **`game.state === 'waiting'`**; active play applies each snapshot immediately.
