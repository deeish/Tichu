# Full Plan: Remove Present and Future Crashes

This document is the **master plan** to eliminate all current and future frontend crashes caused by malformed or missing game state. It complements **docs/FINALLY_KILLING_THE_FREEZE_BUG.md** (freeze/perf) by focusing on **correctness and defensive shape guarantees**.

---

## 1. Principles

1. **Single source of truth**  
   Only one place (**normalizeGameState** in App.jsx) is allowed to define and enforce the shape of game state. Every path that sets game state must run through it. No component should ever receive a `game` that hasn’t been normalized.

2. **Validate at the gate**  
   Any payload that can set game state (especially **game-update**) must be validated or normalized before apply. If the payload is missing required fields, we either fix them in normalization or skip applying (never set state with a broken shape).

3. **Defense in depth**  
   Components that read `game` should use safe access (optional chaining, array checks before `.map`/`.find`/`.filter`) so that even if a bug or future change introduces a bad shape, the UI degrades instead of throwing.

4. **No unguarded array/object access**  
   Before calling `.map`, `.find`, `.filter`, or indexing into `game.players`, `game.turnOrder`, `game.roundLog`, or `entry.players`, always ensure the value is a non-null array (or use optional chaining / default to `[]`).

---

## 2. Current crash points (to remove)

| Location | Issue | When it can throw |
|--------|--------|-------------------|
| **GameInfo.jsx** | `game.players.find(...)` with no guard | Any render when `game` exists but `game.players` is undefined or not an array (e.g. malformed game-update). |
| **Drawer.jsx (GameLogPanel)** | `entry.players.map(...)` | When a `roundLog` entry has no `players` or `players` is not an array (server bug or legacy shape). |
| **Drawer.jsx (Players tab)** | `game.players.map(...)` | When `game.players` is undefined (already guarded by `game?.players &&` but we’ll keep normalization as guarantee). |
| **GameBoard.jsx (dragon)** | `game.players.filter(...)` | When `game.dragonOpponentSelection` is set but `game.players` is missing (edge case). |
| **App.jsx game-update** | No validation of `game.players` | We can call `setState(normalized)` with a normalized object that still had no `players` if we didn’t add a guarantee in normalization. |

---

## 3. Implementation plan

### Phase 1: Harden normalizeGameState (single source of truth)

**File:** `frontend/src/App.jsx`

- **Guarantee `players`**  
  After the existing spreads/caps, ensure:
  - `next.players = Array.isArray(next.players) ? next.players : []`
  - Optionally cap length (e.g. 4) and ensure each element has at least `id` and `name` (defaults) so components never see undefined entries.

- **Guarantee `turnOrder`**  
  - `next.turnOrder = Array.isArray(next.turnOrder) && next.turnOrder.length >= 4 ? next.turnOrder : next.players?.length >= 4 ? [...next.players] : next.players ?? []`
  - Then re-apply the existing `currentPlayerIndex` clamp using `next.turnOrder.length`.

- **Sanitize `roundLog`**  
  - Ensure `next.roundLog` is an array (default `[]`).
  - For each entry in `next.roundLog`, ensure `entry.players` is an array; if not, replace with `[]` or drop the entry so that `entry.players.map` never runs on a non-array.
  - Keep the existing cap (e.g. last 80 entries) after sanitization.

Result: Every object that comes from `normalizeGameState` is safe to pass to any component: `game.players`, `game.turnOrder`, and each `roundLog[i].players` are always arrays.

---

### Phase 2: Validate at the gate (game-update)

**File:** `frontend/src/App.jsx`

- In the **game-update** handler, before using `game`:
  - If `!game || typeof game !== 'object'`, do not apply (or already fall into the `else` that calls `setGameStateRef.current(normalizeGameState(game))` — ensure that branch never runs with `game` undefined; if it does, don’t set state).
  - Optionally: if `!Array.isArray(game.players)` and we want to be strict, skip applying this update and keep previous state (or rely on Phase 1 to fix it by normalizing and forcing `players = []`).
- Recommendation: **Always run through normalizeGameState** and never set state with a raw payload. So even if the server sends a game without `players`, normalized state has `players: []` and no component will throw. No need to “reject” the update; normalization is the fix.

- In the **else** branch of game-update (when `game` is falsy or not an object), do **not** call `setGameStateRef.current(normalizeGameState(game))` with a falsy `game`, because that would set state to `undefined`. Either skip the setState or only run when we have a valid object.

Result: Only well-shaped (normalized) game state is ever written to React state.

---

### Phase 3: Component-level defenses (defense in depth)

**Files:** `GameInfo.jsx`, `Drawer.jsx`, `GameBoard.jsx`

- **GameInfo.jsx**  
  - Change `game.players.find(...)` to `(Array.isArray(game.players) ? game.players : []).find(...)` or `game.players?.find(...)` and treat “not found” as Unknown.  
  - Ensures safety even if normalization is bypassed or payload is from an old client.

- **Drawer.jsx (GameLogPanel)**  
  - When mapping over `roundLog`, use only entries where `Array.isArray(entry.players)` (filter invalid entries, or default `entry.players` to `[]` for that render).
  - So: `roundLog.filter(e => Array.isArray(e?.players)).map(entry => ...)` or inside the map use `(entry.players ?? []).map(...)`.

- **Drawer.jsx (Players tab)**  
  - Keep `game?.players &&`; optionally use `(game?.players ?? []).map(...)` so we never rely on truthy-only (handles empty array the same).

- **GameBoard.jsx (dragon opponent selection)**  
  - Change `game.players.filter(...)` to `(game?.players ?? []).filter(...)`.

Result: No component throws on missing or non-array `players` or `roundLog[].players`.

---

### Phase 4: Worker and apply path

**File:** `frontend/src/App.jsx`

- **Worker result handler**  
  - When applying `d.game` from the worker, the parsed object was built from `JSON.stringify(normalized)`, so it should already have the normalized shape. To be safe, either:
    - Apply `normalizeGameState(d.game)` before calling `pending.apply(normalizedAgain)`, or
    - Ensure the worker only ever receives the output of `normalizeGameState`, so the parsed result is already safe (no extra step if we trust the pipeline).
  - Recommendation: **Apply normalization once before postMessage** (already the case). No need to normalize again on result unless we want defense in depth for worker bugs.

- **Try/catch around apply**  
  - Wrap `pending.apply(d.game)` (and the fallback `pending.apply(pending.normalized)`) in try/catch. On catch, log and optionally apply `pending.normalized` so we never leave the UI in a broken state and never throw out of the socket/worker callback (which would be uncaught by the error boundary).

Result: One bad apply doesn’t take down the app; we fall back to normalized state and log the error.

---

### Phase 5: Documentation and future-proofing

- **docs/CRASH_PREVENTION_PLAN.md** (this file)  
  - Keep as the single place that describes the contract (game state shape), the list of crash points, and the rules for new code.

- **Rules for new code**  
  - When reading `game` in a component:
    - Use `game?.players`, `game?.turnOrder`, `game?.roundLog` for optional chaining.
    - Before `.map`/`.find`/`.filter` on any of these, ensure the value is an array (e.g. `(game?.players ?? []).map(...)`).
  - When adding new game state fields that are arrays or nested objects, add defaults or sanitization in **normalizeGameState** so the rest of the app can assume a safe shape.
  - Do not set game state anywhere without going through `normalizeGameState` (or a helper that calls it).

- **Optional: .cursor/rules or AGENTS.md**  
  - Add a one-line reminder: “Game state must be normalized before setState; components must use optional chaining and array checks for game.players, roundLog, turnOrder.”

Result: New code is less likely to reintroduce crashes.

---

## 4. Order of implementation

1. **Phase 1** – Harden `normalizeGameState` (players, turnOrder, roundLog entries).  
2. **Phase 2** – Fix game-update else branch (don’t set state with falsy game); keep “always normalize before setState” as the rule.  
3. **Phase 3** – Defensive fixes in GameInfo, Drawer, GameBoard.  
4. **Phase 4** – Try/catch around worker apply and fallback to normalized on error.  
5. **Phase 5** – Document rules (this doc + optional cursor/AGENTS reminder).

---

## 5. Contract: normalized game state shape

After normalization, the following are guaranteed for any `game` in React state:

- `game.players` – always an array (possibly empty). Each element has at least `id` and `name` (or defaults).
- `game.turnOrder` – always an array (same length as players or fallback from players).
- `game.currentPlayerIndex` – number in range `[0, turnOrder.length - 1]` (or 0 if turnOrder is empty).
- `game.roundLog` – always an array. Each entry has `entry.players` as an array (possibly empty).
- `game.currentTrick`, `game.hands`, `game.playerStacks`, `game.trickHistory` – already capped and array-safe by existing normalization.

Components may rely on this contract. They should still use optional chaining and array defaults when reading from `game` to be resilient to future changes or bugs.

---

## 6. Global crash hardening (last line of defense)

So that the **browser tab never stays broken** and the user never needs to restart the machine, we add industry-standard last-resort safeguards. These do not prevent every bug; they ensure that when something does go wrong, the user always has a way to recover (Refresh page) instead of a white screen or frozen tab.

### 6.1 Global uncaught-error overlay (DOM-based)

**File:** `frontend/src/clientErrorReport.js`

- **window.onerror:** We already report to the server. We now also call **showGlobalCrashOverlay()** and **return true** (so the browser does not show its own error dialog, which can make the tab feel stuck).
- **window.onunhandledrejection:** Same: report and show the overlay.
- **showGlobalCrashOverlay()** builds a full-screen overlay with **pure DOM** (no React). It appends a div to `document.body` with "Something went wrong", a **Refresh page** button (`location.reload()`), and a **Dismiss** button. This works even when React is broken or the error happened outside the React tree (e.g. in a socket callback or event handler that escaped try/catch).

Result: Any uncaught synchronous error or unhandled promise rejection shows the overlay; the user can refresh and continue without closing the tab or restarting.

### 6.2 Root error boundary

**Files:** `frontend/src/main.jsx`, `frontend/src/components/GameErrorBoundary.jsx`

- **RootErrorBoundary** wraps the entire app in `main.jsx`. It catches any **render** error in the React tree (including in App, landing, or router). It renders a full-page fallback with "Refresh page" and reports via `reportClientError`.
- This complements **GameErrorBoundary** (which wraps only the game board). So we have: (1) React render errors in the whole app → RootErrorBoundary; (2) React render errors inside the game → GameErrorBoundary (with Sync game / Try again); (3) non-React or escaping errors → window.onerror + crash overlay.

### 6.3 Socket handlers never throw

**File:** `frontend/src/App.jsx`

- Every **socket.on(...)** callback is wrapped in try/catch. On throw we log and call **reportClientError**; we do not rethrow. So no socket event can cause an uncaught exception that would trigger the global overlay (unless the throw happens in code we don’t control, e.g. inside React’s setState). Handlers wrapped: disconnect, game-created, player-joined, game-started, game-update, game-state, player-left, error.

### 6.4 Infinite re-render (loop) protection

**File:** `frontend/src/App.jsx`

- A **render-count ref** is incremented on every App commit. A **setInterval** (every 2s) checks: if the count exceeds **200** in that window, we call **showGlobalCrashOverlay()** and **reportClientError** with source `render-loop-guard`. Then we reset the count.
- This catches cases where the main thread yields occasionally (e.g. setState in render or an effect that triggers too many updates). The user sees the recovery overlay instead of a permanently frozen tab. A *tight* infinite loop (no yielding) will still freeze until React throws "Maximum update depth exceeded", which is then caught by **window.onerror** and the same overlay.

### 6.5 Memory exhaustion protection

**Files:** `frontend/src/App.jsx` (normalizeGameState + effect)

- **Payload cap in normalizeGameState:** After applying all existing caps, if `roundLog.length > 40` or `trickHistory.length > 60`, we do a one-time **JSON.stringify(next)** size check. If the length exceeds **MAX_GAME_PAYLOAD_BYTES** (1.5MB), we aggressively trim: `roundLog` to last 10 entries, `trickHistory` to last 20, then report via **reportClientError**. So we never put a multi‑MB game object into state.
- **High-heap reporting:** When the app is in a game (`gameState` truthy), a **setInterval** runs every 60s. If **performance.memory** (Chrome) exists and **usedJSHeapSize > 150MB**, we report once per session via **reportClientError** with source `memory`, so the user can refresh before the tab or browser is killed. A ref ensures we only report once until the user leaves the game.

### 6.6 What we still cannot prevent

- **Native crashes** (browser or GPU bugs) are outside JS; we cannot catch them. They are rare.

Together, Phases 1–5 reduce the chance of a throw; Section 6 (overlay, root boundary, socket try/catch, render-loop guard, memory guards) ensures recovery and limits damage from loops and memory.
