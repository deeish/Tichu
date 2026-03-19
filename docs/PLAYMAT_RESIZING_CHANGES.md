# Playmat Resizing - Required Code Updates

**Done.** Checklist below implemented. Dark green `.play-mat` enlarged via `layoutTokens.js` ratios (0.96/0.92), epsilon 2, and `.play-mat-zone` 98% in `tableSurface.css`.

## Implementation Order (Do This First)
1. **Single source of measured geometry**
   - Make sure all critical sizing inputs come from the same measured inputs (`tableRef`/`centerRect`), not `window.innerWidth`.
2. **Clamp mat size into the available center rect**
   - Ensure the mat never overflows `centerRect.w/h` (smooth scaling over abrupt minimum drops).
3. **Clamp mat position into bounds**
   - After mat size is safe, clamp its computed position so it stays inside the center rect.
4. **Rebase card sizing onto the same measured width basis as the mat**
   - Keep card sizes consistent with mat/trick visuals at each breakpoint.
5. **Only then** review/adjust trick/trick-area sizing (scroll box height)
6. **Finally** revisit seats/won-pile placement and consider seat scaling (if needed)
7. Apply any small overflow/bleed fixes last (one region at a time).

## 1) Clamp playmat size to available center rect
- Update `frontend/src/styles/layoutTokens.js`
  - Change `getMatSize(centerW, centerH)`
    - Avoid hard "remove minimums" behavior; instead clamp into `centerW/centerH` while preserving the mat's intended minimum "feel"
    - Compute mat size from your intended ratios (0.92/0.88), then clamp to the available rectangle using safety margins
      - Ensure `matW <= centerW - epsilon` and `matH <= centerH - epsilon`
    - Implementation rule of thumb: prefer smooth scaling / clamping over abrupt minimum size drops that can make seats/piles look cramped.

## 2) Clamp mat position so it never pushes outside the center rect
- Update `frontend/src/styles/layoutTokens.js`
  - Change `getMatPosition(centerRect, matW, matH)`
    - Clamp computed `x` and `y` to safe bounds so mat stays fully within `centerRect`
    - Keep `MAT_VERTICAL_BIAS` and `MAT_TOP_OFFSET`, but enforce final clamping

## 3) Base card sizing on measured table/center width (not `window.innerWidth`)
- Update `frontend/src/components/GameBoard.jsx`
  - Replace `const containerWidth = window.innerWidth` usage
  - Derive sizing input from measured `tableRef` + computed `centerRect.w`
    - Ensure `exchangeCardSize`, `wonCardSize`, `cardSize` (via tokens) use the same width basis as the playmat
  - When `tableSize` changes, recompute and pass the derived width to token sizing helpers

## 4) Ensure dock width assumptions match actual layout constraints
- Update `frontend/src/styles/layoutTokens.js`
  - Verify `getDockWidthClamp(containerWidth)` is called with the correct container width (measured, not `innerWidth`)
  - If it is used in UI sizing, update call sites to use measured width basis
- Update `frontend/src/components/GameBoard.jsx`
  - Ensure dock/padding values in layout calculations do not assume full viewport width

## 5) Make seat placement resilient at small/odd aspect ratios
- Update `frontend/src/styles/layoutTokens.js`
  - Adjust `getSeatPositions(tableW, tableH, dockH, drawerW, matPosition, matSize)`
    - Clamp returned `x/y` positions to safe bounds within the table column
    - If seats or won piles depend on mat size, scale offsets relative to mat size ratios
- Update `frontend/src/styles/layoutTokens.js`
  - Consider scaling `SEAT_WIDTH` / `SEAT_HEIGHT` based on mat size ratios (instead of fixed pixels)
    - IMPORTANT sequencing: do not change seat scaling until after mat/card sizing are clamped and visually verified.
    - Only scale seats if you confirm won-pile / won-card offsets and spacing still look correct.

## 6) Align trick card area sizing to mat size
- Update `frontend/src/components/Trick.css`
  - Replace fixed `max-height: 220px`
    - Make max-height proportional to mat height (or driven by CSS variable set from JS)
  - Ensure scroll region height matches the mat/trick area so the “Current Trick” box visually fits the playmat at all viewports

## 7) Reduce “bleed” from `overflow: visible` where it hurts small screens
- Update CSS to avoid accidental overlap artifacts on narrow viewports
  - Review and adjust:
    - `frontend/src/components/GameBoard.css` / `frontend/src/styles/layout.css` / `frontend/src/styles/tableSurface.css`
    - Prefer `overflow: hidden` (or controlled overflow) for regions that should not bleed
  - Keep `overflow: visible` only where it is required for hover/stack animations
  - Avoid a broad overflow sweep: change one region at a time and verify interactions (hover/stack/drag) still work.

## 8) Ensure all resize-driven values update from a single measured source of truth
- Update `frontend/src/components/GameBoard.jsx`
  - Ensure:
    - `tableSize` -> `centerRect` -> `matSize` -> `card sizes` -> `seat positions` are derived from the same measured inputs
  - Avoid any leftover direct `window.innerWidth/innerHeight` usage for sizing critical elements

## 9) Add a development-only debug overlay for computed geometry
- Add temporary dev tooling (no user-facing UI)
  - Show computed values:
    - `centerRect.w/h`, `matW/matH`, `matPosition.x/y`, `seatPositions` for each side, `cardSize`, `dockH`
  - Trigger via a query param or `localStorage` flag
  - Purpose: quickly validate clamping/scaling behavior across devices

## 10) Add automated guard tests (logic-level)
- Add unit tests (non-visual) for token math
  - For `getMatSize` and `getMatPosition`:
    - Assert mat stays within center rect for a range of center sizes/aspect ratios
  - If feasible, test `getSeatPositions` outputs are within table bounds

