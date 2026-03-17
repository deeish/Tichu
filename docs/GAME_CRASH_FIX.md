# Game Crash Fix: What Was Wrong and How We Fixed It

This document explains the **crashing** and **freezing** issues the game had (whole tab freezing, browser becoming unusable, sometimes requiring a machine restart) and how we fixed them. For the full technical plan and ongoing rules, see **docs/CRASH_PREVENTION_PLAN.md**.

---

## What was going wrong

- **The game would crash or freeze** during play: sometimes right after the first round, sometimes when clicking the Tichu button with cards selected, sometimes with no obvious trigger.
- **The whole browser tab could become unusable**—white screen, frozen UI, or the browser’s error dialog—and sometimes the only recovery was closing the tab or restarting the machine.
- Crashes could happen **early in a round** (e.g. right after “Start game” or when the first trick started) as well as at round end, so they weren’t only tied to scoring or round-log logic.

---

## Why it was happening (root causes)

We identified several causes working together:

### 1. **Unguarded use of game state in the UI**

The frontend often assumed that `game.players`, `game.turnOrder`, and `game.roundLog[].players` were always present and were arrays. If the server (or any code path) ever sent a game object where one of these was missing or not an array, the UI would call `.map`, `.find`, or `.filter` on `undefined` and **throw**. That could happen on the very first game update (e.g. a malformed payload) or when the first round ended and the Log tab rendered `roundLog` with a bad entry.

**Examples:**  
`game.players.find(...)` in GameInfo (no guard), `entry.players.map(...)` in the Drawer’s round log, `game.players.filter(...)` in the Dragon opponent selection.

### 2. **No single, safe shape for game state**

There was no guarantee that every object stored in React state had a consistent shape. The **game-update** handler could apply payloads that hadn’t been normalized, so components could receive a `game` with missing or wrong types (e.g. no `players`). One bad update was enough to make the next render throw.

### 3. **Uncaught errors in socket and event handlers**

Errors in **socket callbacks** (e.g. `game-update`, `game-state`) and in **event handlers** (e.g. the Tichu button) are **not** caught by React error boundaries. So a single throw in those paths could take down the whole app. The same was true for the worker’s `postMessage` handler: if applying the cloned state threw, it was uncaught.

### 4. **Backend turn state when declaring Tichu**

When a player clicked “Tichu,” the backend could read `game.turnOrder[game.currentPlayerIndex]` without checking that `turnOrder` existed or that the index was valid. In edge cases that could **throw on the server**, which could disconnect the client or leave it in a bad state and contribute to “the game crashed.”

### 5. **No way to recover once something went wrong**

Even when an error was reported (e.g. via `window.onerror`), the UI often had no recovery path. The user was left with a broken tab and no clear “Refresh” or “Sync” option, so it felt like the only fix was closing the tab or restarting the machine.

### 6. **Infinite re-renders and memory growth**

We had no protection against **runaway re-renders** (e.g. setState in render) or **unbounded growth** of game state (e.g. huge payloads or heap usage). Those could freeze the tab or eventually kill it.

---

## How we fixed it

### 1. **Single source of truth: normalizeGameState (App.jsx)**

We hardened **normalizeGameState** so that **every** game object that reaches React state has a safe shape:

- **`game.players`** is always an array (default `[]`).
- **`game.turnOrder`** is always an array (from existing `turnOrder` or a copy of `players`).
- **`game.currentPlayerIndex`** is clamped to a valid index (or 0 if the turn order is empty).
- **`game.roundLog`** is always an array, and **every entry** has `entry.players` as an array (invalid entries are filtered or fixed).

We also **never set state with a falsy game**: the game-update handler only applies when `game && typeof game === 'object'`, so we don’t clear state with `undefined` by mistake.

Result: components never receive a `game` where `players`, `turnOrder`, or `roundLog[].players` are missing or non-arrays from our own state.

### 2. **Defensive reads in components (defense in depth)**

Even if a bad shape ever slipped through, we made the UI safe:

- **GameInfo.jsx:** use `(Array.isArray(game.players) ? game.players : []).find(...)` so missing or non-array `players` doesn’t throw.
- **Drawer.jsx (Log tab):** use `(Array.isArray(entry.players) ? entry.players : []).map(...)` so malformed round-log entries don’t throw.
- **Drawer.jsx (Players tab):** use `(game?.players ?? []).map(...)`.
- **GameBoard.jsx (Dragon):** use `(game?.players ?? []).filter(...)`.

So the UI degrades instead of crashing when the shape is wrong.

### 3. **Socket handlers and worker apply never throw uncaught**

- **Every socket handler** (`game-update`, `game-state`, `game-created`, `player-joined`, `game-started`, `player-left`, `error`, etc.) is wrapped in **try/catch**. On throw we log and report; we do **not** rethrow, so no socket event can take down the app.
- The **game-update** path (including the throttled branch) is fully wrapped; we also catch inside the “apply” step so normalize or setState failures are reported instead of crashing.
- The **worker’s** result handler uses a **safeApply**: we run `pending.apply(g)` in try/catch and, on failure, fall back to `pending.apply(pending.normalized)` and log.
- The **Tichu button** click handler is wrapped in try/catch and uses `game?.tichuDeclarations?.[playerId]` so a missing `game` or `tichuDeclarations` doesn’t throw.

Result: errors in these paths are reported and, where possible, we recover (e.g. apply normalized state) instead of leaving the tab dead.

### 4. **Backend: safe Tichu declaration (declarations.js)**

In **declareTichu** and **undeclareTichu** we no longer assume `game.turnOrder` and `game.currentPlayerIndex` are valid. We check that `turnOrder` is a non-empty array and that `currentPlayerIndex` is in range before reading the current player, and we ensure `game.tichuDeclarations` exists before writing. So the server never throws on invalid turn state when declaring/undeclaring Tichu.

### 5. **Global crash overlay and root error boundary**

So that the user **always** has a way to recover:

- **Global overlay (clientErrorReport.js):** On **window.onerror** and **window.onunhandledrejection** we still report to the server, and we now show a **DOM-based full-screen overlay** (no React) with “Something went wrong,” a **Refresh page** button, and **Dismiss**. We also **return true** from `window.onerror` so the browser doesn’t show its own error dialog. This works even when React is broken.
- **Root error boundary (main.jsx):** The entire app is wrapped in **RootErrorBoundary**, which catches any **render** error in the React tree and shows a full-page “Something went wrong” + **Refresh page** and reports via `reportClientError`.

Result: when something still goes wrong, the user gets a clear way to recover (refresh) instead of a dead tab or feeling like they need to restart the machine.

### 6. **Infinite re-render and memory protection**

- **Render-loop guard (App.jsx):** A ref counts App commits; a **setInterval** (every 2s) checks the count. If it exceeds **200** in that window, we show the global crash overlay and report. So bursts of re-renders (e.g. setState-in-render or a bad effect loop) that yield occasionally are detected and the user can refresh.
- **Memory:**  
  - In **normalizeGameState**, if the payload is still large after existing caps (e.g. `roundLog` or `trickHistory` big), we do a size check and, if over **1.5MB**, aggressively trim `roundLog` and `trickHistory` and report. So we never put a multi‑MB game object into state.  
  - When in a game, a **setInterval** (every 60s) checks **performance.memory** (Chrome); if the heap is over **150MB** we report once per session so the user can refresh before the tab or browser is killed.

Result: we limit damage from runaway renders and from unbounded memory growth.

---

## Summary

| Problem | Solution |
|--------|----------|
| UI threw on missing/non-array `players`, `turnOrder`, `roundLog[].players` | Normalize game state so these are always arrays; add defensive reads in GameInfo, Drawer, GameBoard |
| Bad or falsy payload could be applied to state | Only apply when `game && typeof game === 'object'`; always normalize before setState |
| Socket or worker handler throw → whole app dead | Try/catch every socket handler and worker apply; Tichu button try/catch |
| Backend throw on Tichu declare (bad turn state) | Safe checks for `turnOrder` and `currentPlayerIndex` in declarations.js |
| No recovery once something crashed | Global crash overlay (DOM) + root error boundary; always show “Refresh page” |
| Runaway re-renders or huge state | Render-loop guard (200+ commits/2s → overlay); payload size cap and high-heap report |

Together, these changes **greatly reduce** how often the game crashes or freezes and ensure that when something does go wrong, the user can **recover by refreshing** instead of closing the tab or restarting the machine. The full plan, contract for normalized state, and rules for new code are in **docs/CRASH_PREVENTION_PLAN.md**.
