# Web & mobile usability plan

This doc is a working checklist to take Tichu from “works on my machine” to something that feels solid on phone browsers (and optionally as a light PWA). It is **intentionally aligned with what the repo already implements** — use the sections below so we do not re-plan solved problems.

Use phases in order where it still makes sense: production connectivity should be verified before spending time on PWA polish.

---

## Progress checklist (keep updated)

Legend: `[x]` done · `[ ]` not done  

### Ship-ready / implemented in repo

- [x] **Rotate-to-play gate** — phone portrait during active play; touch-primary detection; copy + `RotateToPlayOverlay`; tests in `rotateToPlay.test.js`.
- [x] **Viewport** — `viewport-fit=cover` in `index.html` (safe-area support for overlay).
- [x] **Exchange on touch** — HTML5 drag disabled when `isTouchPrimaryInput()`; **touch:** tap a hand card then a highlighted seat; **mouse:** drag-to-seat and/or tap-to-fill-next-empty; play-mat copy differs for touch vs mouse (`GameBoard.jsx`).
- [x] **Shared input helper** — `utils/inputCapabilities.js` (used by rotate + exchange).
- [x] **Deploy docs** — `DEPLOY.md`; optional `FRONTEND_ORIGIN` env-only (no spurious code edit).
- [x] **Backend / client plumbing (pre-existing)** — CORS env, socket keepalive, rejoin, resync, client errors, Redis notes — see audit table below.
- [x] **`connect_error` UX** — throttled toast with hint + `VITE_SOCKET_URL`, **Retry** (`socket.connect()`), landing/lobby subtitle while offline (`App.jsx`, `socketEventRegistry.js`, `utils/connectErrorMessage.js`).
- [x] **VisualViewport keyboard gap** — `--vv-keyboard-gap` on `documentElement` (`hooks/useVisualViewportInset.js`); landing bottom padding + drawer chat input padding-bottom; `scrollIntoView` on focus for landing, join, lobby name, chat (`App.jsx`, `Drawer.jsx`).
- [x] **Cold-start “still connecting” (landing)** — if no game yet and no `connect` / `connect_error` for **14s**, amber subtitle + one **warning** toast (server wake / URL) with **Retry**; skipped when `connect_error` already fired (`App.jsx`).
- [x] **Trick history scroll cue (touch)** — faint WebKit scrollbar on `(hover: none)|(pointer: coarse)`; bottom fade + **“More below”** when list overflows (`Trick.jsx`, `Trick.css`).
- [x] **Landing / How-to-play safe-area + keyboard** — `env(safe-area-inset-*)` on `.landing` and `.how-to-play`; `100dvh`; `--vv-keyboard-gap` on How-to-play via `useVisualViewportInsetCssVar` in `HowToPlay.jsx`; coarse **44px** taps for landing footer/secondary links, join row, HTP close (`App.css`, `HowToPlay.css`).

### Verification / manual (not “code done”)

- [ ] **Phase 1 smoke** — production URLs, TLS, two phones finish a hand (cellular + Wi‑Fi).
- [ ] **Phase 3+5** — landscape phone QA matrix, trick scroll discoverability pass; cold-start copy still worth a manual pass on slow tiers.

**Automated regression (not a substitute for real devices):** Vitest covers `layoutTokens` (including a **phone-class** center-rect / table-size matrix), `rotateToPlay`, `connectErrorMessage`, `useVisualViewportInsetCssVar` (CSS var + cleanup), `normalizeGameState`, and selected UI tests. **Pure CSS** (safe-area padding, coarse `@media` touch targets) is not exercised in a real mobile WebKit engine in CI — validate notches and on-screen keyboard on hardware or a device lab when possible.

### Still to build (see phases below)

- [x] **Touch targets (baseline)** — `sidebar-toggle-btn` min 44px + safe-area insets; `lobby-player-edit`; coarse `lobby-team-btn` / save / cancel; `toast-close` hit area (`App.css`, `GameBoard.css`).
- [x] **Toasts vs dock (baseline)** — coarse/touch: stack sits above dock via `max(..., 30vh + safe-area)`; `z-index` above rotate overlay so errors stay visible; desktop unchanged.
- [x] **Safe areas (baseline)** — `hud.css` (top/side insets), `layout.css` (hand-dock-wrapper bottom + sides, `--safe-*` tokens), `drawer.css` (overlay panel inset), `--hud-height` set from `GameBoard` (`HUD_HEIGHT`).
- [x] **Scroll vs drag (baseline)** — scroll containers now use `overscroll-behavior: contain` + iOS momentum scrolling (`-webkit-overflow-scrolling: touch`) in drawer, playmat trick list, and How-to-play/table wrappers.
- [x] **PWA** — `public/manifest.webmanifest`, PNG icons (`public/icons/`, regenerate via `npm run icons`), `public/sw.js` (network-only fetch; skips `/socket.io`); registration in `main.jsx` (production only).
- [x] **Tap card → tap specific seat (touch exchange)** — when HTML5 exchange drag is off (`isTouchPrimaryInput()`): tap a hand card to pick it (again to clear), then tap a highlighted opponent seat; dock hint + play-mat copy updated; gold emphasis on pick + seats (`GameBoard.jsx`, `HandDock.jsx`, `handDock.css`, `tableSurface.css`).

### Fit with current UI/UX (design + surfaces)

The plan matches how the app is actually built:

- **Landing & lobby** (`App.css`): centered column, max-width ~420px, soft gradient, frosted buttons — **safe-area** + `dvh` on the shell; **keyboard:** `visualViewport` gap + scroll-into-view; **connection:** `connect_error`, stall hint, Retry (see checklist).
- **Table** (`tableSurface.css` + themes on `.game-layout[data-theme]`): dense “felt table” with HUD, absolute seats, and a **hand dock** as the primary control surface. Mobile strategy should preserve that hierarchy: dock stays the hero; sidebar stays secondary (overlay + toggle is already the pattern).
- **Secondary chrome**: Chat / log / theme live in the drawer; resync and connection pill are already grouped there — good for mobile if the **Show panel** control stays thumb-reachable and large enough (see gaps below).
- **Motion**: exchange flight overlay and toast stack are fixed-layer UX; safe-area + z-index audits should include them so they do not sit under iOS home indicator or obscure the dock primary buttons.
- **Orientation**: the table + dock layout is built for a **wide** short viewport. On phones, **landscape should be the expected mode for active play** (portrait is fine for landing, lobby, and How to play). See Phase 2 — orientation.

If a change fights this hierarchy (e.g. hiding the dock on small screens), it would work against the current design; the plan below assumes **tune geometry and touch behavior**, not a new layout paradigm.

### Rotate-to-play — messaging spec (implemented)

Goal: **no one thinks the app is broken** in portrait during a hand; they should feel **told what to do** and **why**.

| Rule | Choice |
|------|--------|
| **When** | Only while **active play** is on screen: same gate as `ACTIVE_GAME_STATES` in `App.jsx` (includes finished / end-game test board). **Not** on welcome, lobby, or `/how-to-play` — portrait is fine there. |
| **Who** | **Touch-primary + compact portrait**: `matchMedia('(hover: none)')` or `(pointer: coarse)` **and** `min(w,h) ≤ 720` **and** height &gt; width — avoids a **mouse desktop** with a tall, narrow window seeing “Turn your phone.” Wide tablets (e.g. iPad portrait) stay unblocked. Logic: `shouldPromptRotateToLandscape` (`frontend/src/utils/rotateToPlay.js`). |
| **Tone** | Direct, not apologetic: requirement is **physical rotation**, not a settings bug. Reassure once (“Nothing is wrong…”) so people don’t force-quit. |
| **Headline** | “**Turn your phone**” — imperative, scannable. |
| **Body** | State that **landscape is required**, name **table + hand** as what won’t fit, use **“will not fit”** so expectation is clear. |
| **Dismiss** | Automatic on **landscape** or resize; no tap-to-dismiss (would let people play portrait and hit layout bugs). |
| **A11y** | `role="alertdialog"`, `aria-modal="true"`, labelled title + description; motion reduced = static sideways phone cue. |
| **Chrome** | `viewport-fit=cover` in `index.html` so safe-area padding on the overlay respects notches. |

Code: `RotateToPlayOverlay.jsx`, `RotateToPlayOverlay.css`, `useRotateToPlayGate.js`.

---

## What we already have (audit)

Use this as the source of truth for “done vs TODO”. Update it when behavior changes.

| Area | Implemented | Where / notes |
|------|-------------|----------------|
| **Deployment guide** | Yes | `docs/DEPLOY.md` — Vercel (`frontend/`) + Render (`backend/`), `VITE_SOCKET_URL`, optional `REDIS_URL`, health check `/health`. `README.md` summarizes the same. |
| **CORS / Socket.IO origin** | Yes (configurable) | `backend/server.js` — `FRONTEND_ORIGIN` defaults to `*`; set to your Vercel URL in production when you want lockdown. See `docs/DEPLOY.md` §3 (env-only). |
| **Socket keepalive (mobile-friendly)** | Yes | `backend/server.js` — `SOCKET_IO_PING_TIMEOUT_MS` / `SOCKET_IO_PING_INTERVAL_MS` (comment notes mobile / background tabs). |
| **Client → server errors** | Yes | `frontend/src/clientErrorReport.js` — `socket` emit + `fetch` POST to `/api/client-error` using `VITE_SOCKET_URL`; global crash overlay; `backend/server.js` logs payload. |
| **Rejoin after disconnect / restart** | Yes | `App.jsx` — `rejoin` + `get-game-state` fallback, `localStorage` game + token; Redis restore in backend forces `disconnected` until clients rejoin (`server/gamePersistence.js`). |
| **Resync / desync recovery** | Yes | `App.jsx` — `handleResyncGame` with backoff, stale `stateVersion` drops, protocol banner; sidebar can trigger resync; `GameErrorBoundary` offers “Sync game”. |
| **Connection UI (partial)** | Yes | Landing: “Connected” / “Connecting…” / **`connect_error`** / **amber slow-connect** after 14s if no handshake; toasts + **Retry**; in-game: `GameHud` + drawer `sidebar-status`; seats disconnected overlay; lobby “Reconnecting…”. |
| **Performance guards** | Yes | `App.jsx` — Web Worker for cloning game state; render-loop guard; optional heap warning; `startTransition` on applies. |
| **Viewport meta** | Yes | `frontend/index.html` — includes `viewport-fit=cover` for safe-area. |
| **PWA (baseline)** | Yes | `frontend/public/manifest.webmanifest`, icons in `public/icons/`, `theme-color` + Apple meta/link tags in `index.html`, `public/sw.js` (network-only; skips `/socket.io`); SW registered from `main.jsx` in production builds only. |
| **Rotate-to-play gate** | Yes | `RotateToPlayOverlay` + `shouldPromptRotateToLandscape` — blocking overlay in phone portrait during active play (see messaging spec above). |
| **Responsive layout core** | Yes | `layoutTokens.js` — sidebar **overlay** under 1180px, dynamic sidebar width on desktop, dock height from `vh`, mat/seat math clamped for small rects, `getVisibleHandCap` / `getHandRailStep` for narrow widths. |
| **Layout shell** | Yes | `layout.css` — grid, `.sidebar-overlay-*`, `overflow: hidden` on main shell; `GameBoard.jsx` measures width/height with `ResizeObserver`. |
| **Drawer / sidebar on small screens** | Yes | `drawer.css` — fixed full-height overlay, slide in/out, `min(92vw, 360px)`. |
| **Hand dock breakpoints** | Yes | `handDock.css` — `@media` at 1280 / 980 / 860. |
| **Rules / How to play responsive** | Yes | `HowToPlay.css` — multiple breakpoints (known scroll/content bugs tracked in `FUTURE.md`). |
| **Pointer / touch for hand reorder** | Yes | `HandDock.jsx` — `onPointerDown` for reorder path (pointer events unify mouse + touch). |
| **Exchange without touch DnD** | Yes | `GameBoard.jsx` — HTML5 drag for exchange **off** on touch-primary; **mouse** still drag-to-seat or fill-next empty via hand taps; **touch** tap hand card then tap highlighted seat (out-of-order seats OK); dedupe if same card moved between slots. |
| **Touch-target baseline** | Yes (partial) | `GameBoard.css` — sidebar toggle ≥44px, safe-area; `App.css` — lobby name edit, team/save/cancel on coarse, toast dismiss 44px, **landing** footer/secondary/join row on coarse; `HowToPlay.css` — close ≥44px coarse. |
| **Toast stacking** | Yes (baseline) | `App.css` — touch: bottom clears dock + safe-area; `z-index` above rotate overlay. |
| **Safe-area HUD / dock / drawer** | Yes (baseline) | `hud.css`, `layout.css` (`--safe-*`, dock height + bottom inset), `drawer.css` overlay; `GameBoard` sets `--hud-height`. |
| **Reduced accidental text selection** | Yes | `Card.css`, `handDock.css` — `user-select: none` where appropriate. |
| **Accessibility (partial)** | Yes | Toasts `aria-live`; drawer tabs `role="tablist"`; many `aria-label`s on game controls, wish grid, won piles, sidebar toggle; `HowToPlay.jsx` landmark structure. |

**Not found / not implemented yet (gaps for mobile polish)**

- **Exchange:** **touch** — tap hand card, then tap highlighted seat (see checklist). **Mouse** — HTML5 drag to seat and/or fill-next-empty hand taps.
- **Sidebar toggle / toast placement (baseline done)** — see Progress checklist; further tweaks possible after device QA.
- **Trick history** — **baseline:** coarse-pointer WebKit thumb + **“More below”** + fade when not scrolled to end; re-check on device if mat theme needs stronger contrast.
- **PWA (baseline)** — `manifest.webmanifest`, icons, **theme-color** `#1a3d2e` in `index.html`, minimal **network-only** `sw.js` (no static shell cache yet; multiplayer still requires network). Optional later: cache hashed assets only + skip API/socket paths.
- **`env(safe-area-inset-*)`** — HUD, hand-dock wrapper, overlay drawer, rotate overlay, **landing** (all sides), and **How-to-play** shell; keyboard gap still via `--vv-keyboard-gap`.
- **`connect_error` + Retry** — implemented; **landing stall** (~14s without connect/error) provides cold-start copy + Retry.
- **`visualViewport`** — **baseline:** `--vv-keyboard-gap` + landing / chat input padding + `scrollIntoView` on focus; tune on real devices if a browser ignores `visualViewport`.
- **Touch-action:** baseline is in place where drag starts (`HandDock` reorder cards); keep auditing new interactive zones as they are added.
- **Hover-only** polish: many controls use `:hover` for **emphasis only** (not sole affordance) — still audit for any “invisible until hover” behavior.
---


## Phase 1 — Production connectivity (verify, don’t reinvent)

Most of this is **documented and coded**; the work is validation and tightening.

1. **Follow `docs/DEPLOY.md`** — confirm Vercel `VITE_SOCKET_URL` matches the live Render URL; redeploy after env changes.
2. **HTTPS / WSS** — both hosts should serve TLS; mixed content will break sockets.
3. **Optional: set `FRONTEND_ORIGIN`** on Render to your exact Vercel origin (no trailing path) so CORS is not `*`.
4. **Health and persistence** — use `GET /health` (`persistRedis` field) to confirm Redis if you rely on post-crash party recovery.
5. **Smoke test on real phones** (Wi‑Fi + cellular): lobby, full hand, background tab, return to app (rejoin path).

**Definition of done:** Same as before — two phones, different networks, finish a hand with no CORS/socket failures. **`DEPLOY.md` free-tier cold-start note:** if you ever use a sleeping tier again, add explicit “still connecting” / timeout copy (see Phase 3).

---

## Phase 2 — Mobile browser ergonomics

1. **Exchange flow on touch** — **Done:** disable HTML5 exchange drag on touch-primary; **tap hand card then tap seat** for any highlighted opponent order; mat + dock hints (see Progress checklist).
2. **Touch targets** — **Baseline done** (sidebar, lobby edit/team/save-cancel, toast close, **landing** coarse links + join row, **How-to-play** close). **Optional follow-up:** dock action buttons — audit on device.
3. **Toast vs dock** — **Baseline done** for coarse/touch (see checklist). Revisit if a device still clips messages.
4. **Scroll vs drag** — **Baseline done:** drawer/chat/log, play-mat trick scroller, and How-to-play body/table wrappers now use `overscroll-behavior: contain`. Keep validating drag areas when new gestures are added.
5. **Hover-only UI** — list and fix any control that only appears on `:hover` (if any remain on trick preview, cards, etc.).
6. **Virtual keyboard** — **Baseline:** `visualViewport` gap + `scrollIntoView` on landing, join, lobby name, chat (see checklist).
7. **Landscape for active play (phones)** — **Done:** `RotateToPlayOverlay` + spec (see above). Optional later: `screen.orientation.lock('landscape')` after fullscreen on Android only — **not** required on iOS.
8. **Safe areas** — **Baseline done** (HUD, dock wrapper, overlay drawer, sidebar toggle, **landing**, **How-to-play** page shell + `dvh`).

**Definition of done:** Full session playable thumbs-only in **landscape** on phones (rotate prompt until landscape), no accidental page zoom, no stuck scroll during card interactions.

---

## Phase 3 — Responsive layout polish

A lot of **layout math and breakpoints already exist**; this phase is mostly **QA and tuning**.

1. **Real device matrix (prioritize landscape phones)** — test primary path: **landscape** (~667×375-class and similar); confirm mat, seats, and dock never clip. **Portrait during active play** should be handled by the rotate gate (Phase 2), not treated as a first-class layout target.
2. **Extra-narrow tier** — if 9 visible cards still feel tight, consider a `<640px` tier in `getCardSize` / `getDockCardSize` (rail step already compresses).
3. **Typography** — bump rules / log readability on small screens if `HowToPlay` / `drawer` text feels small (FUTURE.md mentions scroll issues in rules — fix there first).
4. **Trick / playmat sub-panels** — **Baseline:** scroll cue + coarse scrollbar in `Trick` (see checklist); device QA still useful for contrast and long tricks.
5. **Cold start + failed connection UX** — **Done (baseline):** `connect_error` toast (throttled), **Retry**, URL in copy, landing/lobby hints, **14s landing stall** when handshake never completes (free-tier wake / wrong URL). **Optional:** lobby/in-game “still syncing” banners beyond this scope.

**Definition of done:** No clipped controls; readable copy; users understand when the server is unreachable vs loading.

---

## Phase 4 — PWA (optional)

**Baseline in repo:** manifest + icons + minimal SW; **not** a full offline shell.

1. **Done:** Web app manifest (name, icons, `display`, theme colors) — `frontend/public/manifest.webmanifest`.
2. **Done:** Maskable + any icons (`icon-512.png` / `icon-192.png`) + Apple touch icon — `frontend/public/icons/`; source generator `frontend/scripts/generate-pwa-icons.mjs` (`npm run icons`).
3. **Done (minimal):** Service worker `frontend/public/sw.js` — `fetch` passthrough only; does **not** respond for `/socket.io` so the browser keeps normal Socket.IO behavior. **Not** caching the static shell yet (add only if you want offline splash / faster repeat visits, with careful exclusions).
4. **Manual:** Test iOS **Add to Home Screen**, standalone display, suspend/resume and reconnect (same as Phase 1+3 network expectations).

**Definition of done:** Installable / A2HS-ready where the platform supports it; multiplayer still requires network.

---

## Phase 5 — Quality bar

1. **Browsers** — Safari iOS, Chrome Android, spot-check Firefox; exercise **portrait → rotate → landscape** on real devices; desktop Safari/Chrome regression check.
2. **Accessibility** — extend beyond current labels: focus rings for keyboard, contrast checks on theme variants.
3. **Performance** — mid-range phone: worker + throttles already exist; profile deal animations if jank appears.
4. **Error pipeline** — client errors already reach the server; in production, confirm logs (or forward to a log service) include mobile `User-Agent` if you add it to the payload later.

---

## Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| 1 Deploy & verify | ☐ | See `DEPLOY.md`; optional `FRONTEND_ORIGIN` |
| 2 Touch & ergonomics | ☑ | **Rotate, exchange tap, toasts, HUD/dock/drawer safe-area, landing+HTP shell safe-area, scroll/drag baseline**; optional hover audit, dock button pass |
| 3 Responsive QA & UX | ☐ | Tokens/CSS largely exist |
| 4 PWA | ☑ | Manifest + icons + minimal SW (`sw.js`); optional asset shell cache later |
| 5 Quality bar | ☐ | Partial a11y already |

Update the **“What we already have”** table when you ship new behavior. File new defects in `docs/BUGS.md` where appropriate.
