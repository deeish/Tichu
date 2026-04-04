# Mobile scale execution plan

This document is the **implementation playbook** for fixing “cards and dock feel huge vs the board” on phone landscape **without** another long cycle of scattered CSS/token tweaks. Read it end-to-end before writing code.

**Related docs:** `WEB_MOBILE_PLAN.md` (checklists, Phase 6 notes), `frontend/src/styles/layoutTokens.js` (current math).

**Implementation status (in repo):** **Phase A + B** — viewport card budget in `layoutTokens.js` (see above). **Phase C** — `GameBoard` `useLayoutEffect` sets `--game-vv-w`, `--game-vv-h`, and on phone tiers `--card-max-w` / `--card-max-h` on `.game-layout`; `handDock.css` ultra-compact rail uses `var(--card-max-h)` with `max()` fallbacks; viewport state sync listens to `visualViewport` resize/scroll. **Phase D** — tune `getMatSize` / `getMatPosition` / `getTopBand` on device if mat vs seats overlap; tests cover mat-in-rect + tiered offsets. **Phase E** (global `transform: scale`) optional.

---

## 1. Problem statement

### What we observe

- Hand cards and/or dock chrome consume a **disproportionate share** of the vertical viewport compared to the green table / trick area.
- **Typography scaling** inside `Card` helps glyphs fit the white box, but it does **not** change the fundamental ratio of “hand real estate vs table real estate.”
- Incremental changes to `getDockCardSize`, `getDockHeight`, rail step, etc. produce **small subjective gains** because **multiple independent pipelines** still size different surfaces (dock cards, trick cards, mat, seats) from **different bases**.

### Root cause (design-level)

There is **no single, enforced budget** tied to the **visible viewport** (ideally `visualViewport`) that says: “a playing card may not exceed **X%** of the screen” and “the dock may not exceed **Y%**.” Until that exists, every tweak is local optimization.

---

## 2. Guiding principle

**One viewport-derived “card unit,” then derive everything else.**

- Define a **maximum card height** (and width from a fixed aspect ratio, e.g. **5∶7**) as a function of **`visualViewport.height`** (and optionally width), not only of table column width or `getCompactTier` alone.
- **Clamp** dock cards, trick cards, exchange mini-cards, and (if needed) table “base” card sizes to that unit or to **simple fractions** of it (e.g. trick = `0.65 ×` dock).
- **Cap dock total height** so the hand cannot grow unbounded in `vh` even if the rail fits more pixels.

This aligns with the “camera / HUD scale” idea already sketched in **Phase 6** of `WEB_MOBILE_PLAN.md`, but phases below are ordered for **fast validation** before a full transform-scale refactor.

---

## 3. What not to do (until necessary)

| Approach | Why defer |
|----------|-----------|
| More edits only to `Card.jsx` / `Card.css` | Fixes glyphs inside the box, not **share of screen**. |
| Tweaking only `getDockCardSize` constants without a **hard vvH cap** | Easy to undo elsewhere (dock height, rail, mat). |
| Per-component breakpoints in many CSS files | Hard to reason about and regress. |
| Full `transform: scale()` on the whole app | Powerful but easy to break hit-testing / fixed UI unless planned (save for Phase C or a spike). |

---

## 4. Recommended execution phases

Execute **in order**. Each phase should be shippable and testable on a real phone before the next.

### Phase A — Baseline metrics (half day)

**Goal:** One place in the app logs or exposes the numbers we will policy against.

1. **Source of truth for “visible” size**  
   - Prefer **`window.visualViewport.width` / `height`** when available; fall back to `window.innerWidth` / `innerHeight`.  
   - Subscribe to `visualViewport` `resize` + `scroll` if needed (address bar show/hide).

2. **Optional dev-only overlay** (or `?geomDebug=1` extension)  
   - Show: `vvW`, `vvH`, `innerW`, `innerH`, compact tier, `getDockHeight()`, dock card w/h from tokens, measured dock wrapper height.

3. **Screenshot matrix** (manual)  
   - iPhone Safari landscape: normal tab + A2HS if possible.  
   - One Android Chrome landscape.  
   - Note: address bar visible vs hidden changes `vvH` — policy must tolerate both or document “best in standalone.”

**Exit criteria:** You can answer “what is vvH on my device when it looks wrong?” without guessing.

---

### Phase B — Viewport card budget (core fix, 1–2 days)

**Goal:** Enforce a **maximum physical card size** on phone tiers from viewport height.

1. **Add helpers in `layoutTokens.js` (single file, clear names)**  
   Examples (names illustrative; tune constants once in QA):

   ```text
   getVisualViewportSize() → { w, h }   // SSR-safe
   getPhoneCardBudgetPx(vvH) → { maxCardH, maxCardW }   // e.g. maxCardH = min(56, vvH * 0.10)
   ```

   - **Start conservative:** e.g. `maxCardH = vvH * 0.10` (10% of visible height) with **absolute** floor/ceiling (`clamp(40, computed, 56)` or similar) so text stays legible and thumbs still hit cards.  
   - **Aspect:** `maxCardW = round(maxCardH * 5/7)` (or match existing card aspect).

2. **Apply budget inside existing functions (minimal surface area)**  
   - **`getDockCardSize(containerWidth, viewportHeight)`** — After current tier logic, **clamp** returned `{ w, h }` so `h <= maxCardH` from **`getPhoneCardBudgetPx`** when `getCompactTier` is `compact` or `short`.  
   - **`getTrickCardSize`** — Express as **ratio of dock** or **ratio of same `maxCardH`** so trick and hand don’t drift (e.g. `0.62 ×` dock height).  
   - **`getCardSize`** (table / general) — On phone tiers, align to same budget or a single multiple of `maxCardH` so the **board** doesn’t show oversized plays while the hand is forced small.

3. **Dock height cap**  
   - **`getDockHeight()`** — On compact/short, ensure returned value ≤ **header + rail (max card h) + actions row + padding + safe area**, and ideally ≤ **`vvH * 0.22`** (tune).  
   - Prevents the dock from **eating** the table after cards shrink.

4. **`GameBoard` / `HandDock`**  
   - No structural change if tokens already receive `containerWidth` / `containerHeight`; **verify** `tableContainerHeightBasis` uses something correlated with `visualViewport` (already partially true).  
   - If mismatch (e.g. table height vs vvH), pass **vvH** into token functions for **budget only**.

**Exit criteria:** On a 390px-tall landscape viewport, hand cards are **visibly smaller** relative to the full screen; dock total height drops in proportion; trick cards match the new scale.

---

### Phase C — Optional: CSS custom properties (1 day, maintenance win)

**Goal:** Fewer magic numbers in CSS; one dial for designers.

1. On **`game-layout`** (or `#root` during active play), set:

   ```text
   --game-vv-h: <from visualViewport>;
   --card-h-max: min(12vh, 56px);   /* or match JS budget exactly via inline style from GameBoard */
   ```

2. Prefer **JS-set variables** from the same `getPhoneCardBudgetPx` so JS and CSS never disagree.

3. Gradually move dock rail padding / button heights to `calc(var(--card-h-max) * …)` where it helps.

**Exit criteria:** Changing one budget constant updates both tokens and key CSS spacings predictably.

---

### Phase D — Mat & center zone (after B looks right)

**Goal:** Play mat and empty-state copy don’t dominate or overlap seats.

1. Revisit **`getMatSize` / `getMatPosition` / `getTopBand`** with the **new** card and dock sizes in mind — not necessarily smaller mat first, but **consistent vertical rhythm**: top seat ↔ mat ↔ trick.  
2. Adjust **`MAT_VERTICAL_BIAS` / `MAT_TOP_OFFSET`** only after **Phase B** stabilizes dock/table card sizes (otherwise you chase overlap forever).

**Exit criteria:** No systematic overlap of top seat on trick header at golden viewports (see `WEB_MOBILE_PLAN` Phase 6 table).

---

### Phase E — “Camera scale” (optional, larger refactor)

**Goal:** Entire table + dock scale together like one scene.

1. Introduce `gameScale = f(min(vvW, vvH))` clamped to `[0.75, 1]` on phone.  
2. Apply via **`transform: scale(gameScale)`** on a wrapper around **`.game-left`** **or** multiply all layout tokens by `gameScale`.  
3. **Watch:** pointer coordinates, fixed-position sidebar toggle, toasts, `position: fixed` drag previews — may need `transform` on a layer that doesn’t break hit-testing or move overlays outside the scaled subtree.

**When to do it:** If Phase B + D still can’t match laptop *proportion* without breaking touch targets — or if you want one zoom slider for “whole UI.”

**Spike first:** Temporary `scale(0.85)` on `.game-left` for one internal build to validate feel before committing to the full approach.

---

## 5. Files likely to change (reference)

| Area | Files |
|------|--------|
| Budget + clamp | `frontend/src/styles/layoutTokens.js` |
| VV metrics / CSS vars | `frontend/src/components/GameBoard.jsx`, possibly `hooks/useVisualViewportInset.js` or a tiny `useVisualViewportSize` |
| Dock | `frontend/src/components/HandDock.jsx` (only if props need vvH) |
| Card | `frontend/src/components/Card.jsx` — only if budget changes aspect; inner scaling stays as-is |
| Tests | `frontend/src/styles/__tests__/layoutTokens.test.js` — add cases for `vvH` × compact tier |

---

## 6. Verification checklist (before merge)

- [ ] **Landscape phone:** hand cards clearly smaller vs full screen than current `main` / pre-change screenshot.  
- [ ] **Trick + dock:** same visual family (no tiny trick + huge hand).  
- [ ] **URL bar show/hide:** layout doesn’t break; no horizontal scroll.  
- [ ] **Touch:** Play / Pass / card selection still comfortable (≥44px targets where required).  
- [ ] **Desktop / wide:** unchanged behavior (tier = `regular`, no accidental clamp).  
- [ ] **`npm test`** (and e2e if you have them) green.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Cards too small to read | Use `clamp` with a **floor** px; test on smallest target device. |
| Dock too cramped | Cap dock **height** separately; allow wrapping actions (already partially done). |
| Token test churn | Add tests for **budget clamp** with fixed `vvH` inputs. |
| `visualViewport` quirks | Fallback to `innerHeight`; document iOS Safari behavior. |

---

## 8. Summary

**Fastest path to real improvement:** **Phase B** — one **viewport-height-derived max card height** (and derived dock height cap), implemented **centrally** in `layoutTokens.js`, applied to dock + trick + (as needed) table card sizing. Everything else (CSS vars, mat tuning, global scale) builds on that once proportions are finally under control.

When this doc is approved, create a short-lived branch, implement Phase A–B first, **test on device**, then iterate through C–E only if needed.
