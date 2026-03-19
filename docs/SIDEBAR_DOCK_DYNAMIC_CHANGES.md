# Sidebar + Hand Dock Dynamic - Required Code Updates

## Implementation Order (Do This First)
1. **Single source of measured geometry**
   - Drive all sidebar + dock sizing inputs from measured elements (`ResizeObserver` on sidebar + hand dock wrappers), not fixed constants and not `window.innerWidth`.
2. **Make the sidebar width truly dynamic**
   - Replace fixed `--sidebar-w` / `sidebarW = 320` with a measured + clamped value.
   - Decide how the sidebar behaves on small screens (collapse to 0 and overlay, or shrink to a safe min width).
   - Important safety: when “hidden”, ensure the sidebar is `pointer-events: none` (or not rendered) so it can’t intercept taps/drag events on mobile.
3. **Make the hand dock width truly dynamic**
   - Measure the actual width available to the hand dock wrapper and pass that width into `HandDock` (so card sizes and hint/action layout are correct).
4. **Remove hard min-width / large fixed clamps that break mobile**
   - `handDock.css` currently enforces `min-width: 1040px` for `.hand-dock` which will overflow on mobile.
5. **Clamp dock content to avoid overlap**
   - Ensure the dock’s actions box and card rail never overflow the wrapper (wrap/compact/hide where needed).
   - Also update the *math* that determines how many cards are visible and how tightly they’re spaced:
     - `getVisibleHandCap(containerWidth)` should be a function of measured dock wrapper width (not always 14).
     - `getHandRailStep(...)` / spacing should shrink when width shrinks so the rail doesn’t force horizontal overflow.
6. **Ensure table + playmat continue to use the measured table column**
   - After sidebar width becomes responsive, the table column width will change automatically; the playmat logic should adapt without special casing.
7. **Add/extend dev geometry overlay**
   - Extend the `?geomDebug=1` overlay so we can visually confirm measured sidebar width, dock wrapper width, and computed clamped values across breakpoints.
8. **Add logic-level tests**
   - Add unit tests for new “clamp” helpers (sidebar width clamp, dock width clamp, and any new token math introduced).

## 1) Single source of measured geometry
- Update `frontend/src/components/GameBoard.jsx`
  - Add `ref`s for:
    - the right sidebar element (`.sidebar-column` / the `<aside>` rendered by `Drawer`)
    - the hand dock wrapper (`.hand-dock-wrapper`)
  - Add a `ResizeObserver` for each measured element.
  - Store:
    - `sidebarSize = { w, h }`
    - `dockWrapperSize = { w, h }`
  - Replace sizing inputs:
    - Remove hard-coded `const sidebarW = 320;`
    - Keep an `window.innerWidth` fallback only for the *very first render* before `ResizeObserver` fires, but once measured values exist:
      - never use `window.innerWidth`/`innerHeight` for critical sizing (sidebar/table mat/dock).
  - Update CSS variables on `.game-layout` (via `layoutRef`) from measured values:
    - e.g. `--sidebar-w`
    - (optional) `--dock-w` (hand dock wrapper width) if you want CSS to react to it directly.

## 2) Make the sidebar width truly dynamic
- Update `frontend/src/styles/layoutTokens.js`
  - Remove the assumption that `--sidebar-w` is fixed forever.
  - Keep a sensible default, but allow JS to overwrite `--sidebar-w` on `.game-layout`.
- Update `frontend/src/styles/layout.css`
  - Ensure the grid column uses CSS vars, and also allows shrinking:
    - currently `grid-template-columns: 1fr var(--sidebar-w)`
    - consider `grid-template-columns: 1fr minmax(0, var(--sidebar-w))` so it can shrink on narrow screens.
- Update `frontend/src/styles/drawer.css`
  - Change `.sidebar-column` so it can collapse cleanly:
    - keep `width: var(--sidebar-w)` but ensure `min-width` can be `0` (or derived) so it doesn’t force overflow.
- Add a small-screen behavior decision
  - In JS or CSS (prefer JS for consistency with “measured geometry”):
    - If `viewportW < SOME_THRESHOLD`, set `--sidebar-w` to `0` and add a class like `sidebar--hidden`
    - then render the sidebar (`Drawer`) as an overlay (or reveal it via a button).
  - This prevents the table column and hand dock from being squeezed into unusable widths.
- Ensure overlay-safe interactions
  - When collapsed/hidden:
    - set `pointer-events: none` on the overlay container (or do not render it)
    - ensure the reveal button is the only interactive element
  - Important: when sidebar width is 0, the sidebar element’s measured width will also be 0.
    - Do not use “sidebar measurement while hidden” as an input for deciding table/dock layout.
    - Use a stable measurement such as the left/table column width (`tableRef`) or viewport width for collapse decisions.

## 3) Make the hand dock width truly dynamic
- Update `frontend/src/components/GameBoard.jsx`
  - Replace:
    - `dockContainerWidth = tableSize.w > 0 ? tableSize.w : window.innerWidth ...`
  - With:
    - `dockContainerWidth = dockWrapperSize.w` (measured)
  - Pass `containerWidth={dockContainerWidth}` to `<HandDock />`.

## 4) Remove hard min-width / large fixed clamps that break mobile
- Update `frontend/src/styles/handDock.css`
  - Current issue:
    - `.hand-dock { width: clamp(1040px, 90vw, 1520px); min-width: 1040px; }`
  - Required change:
    - make `.hand-dock` fill its wrapper:
      - `width: 100%`
      - `min-width: 0`
      - keep `max-width: 100%`
  - Ensure internal layout still sizes correctly using `containerWidth` passed into `HandDock.jsx`.

## 5) Clamp dock content to avoid overlap
- Update `frontend/src/components/HandDock.jsx` + `frontend/src/styles/handDock.css`
  - Audit fixed widths:
    - `.dock-actions-box { width: 162px; }`
    - Any other fixed pixel widths that can’t shrink on narrow screens
  - Add responsive behavior for the dock actions:
    - At narrow widths, stack hint/actions more compactly.
    - At extreme narrow widths, consider hiding less-important hint text first.
  - Ensure card rail + actions box layout never forces horizontal overflow:
    - Prefer flex wrapping or reducing paddings/gaps at small widths.
  - Validate tap/drag hitboxes:
    - When the dock rail is compacted (fewer visible cards / tighter spacing), confirm card click + drag gestures still use the correct pointer coordinate mapping.
  - Important: make visible-card + rail-spacing math width-driven (avoid hard-coded 14 + fixed step)
    - `getVisibleHandCap(containerWidth)` is currently effectively constant (`MAX_HAND_CAP`), so it can’t guarantee rail fit on narrow docks.
    - `getHandRailStep(...)` currently returns a fixed step (`HAND_RAIL_STEP`) when visibleCount > 1, which can overflow if rail width shrinks.
    - Required change:
      - compute visibleCount and/or step using the *measured rail width* (`railW` from HandDock’s ResizeObserver), not just the dock wrapper width.
      - clamp the step so cards remain clickable and don’t render off-rail.

## 6) Ensure table + playmat continue to use measured table column
- After the sidebar becomes responsive, the table column width (`tableRef`) should change automatically.
- Confirm the playmat pipeline still uses measured inputs:
  - `ResizeObserver(tableRef)` -> `tableSize` -> `centerRect` -> `getMatSize/getMatPosition`
- No special “mobile overrides” should be needed for the play-mat if measurements are correct.

## 7) Add/extend dev geometry overlay
- Update the `geomDebug` overlay in `frontend/src/components/GameBoard.jsx`
  - Add:
    - `sidebar: w=...`
    - `dock wrapper: w=...`
    - any computed clamp decisions (e.g. `sidebarMode=overlay|collapsed|sideBySide`)
  - Purpose: verify that the computed geometry is consistent across portrait/landscape and narrow widths.

## 8) Add logic-level tests
- Update `frontend/src/styles/__tests__/layoutTokens.test.js` (or create new test file)
  - Add unit tests for any new helper functions introduced in `layoutTokens.js`, such as:
    - `getSidebarWidthClamp(viewportW)` (or equivalent logic helper)
    - `getDockWidthClamp(dockWrapperW)` (or equivalent logic helper)
  - Validate that clamping respects:
    - minimum safe widths
    - “collapsed/overlay” behavior thresholds
    - no negative/NaN geometry values

## Notes / Known current constraints (what this plan is addressing)
- `frontend/src/styles/layoutTokens.js`
  - `--sidebar-w` is treated as fixed (`320px`)
- `frontend/src/components/GameBoard.jsx`
  - `const sidebarW = 320;` (static)
  - `dockContainerWidth` fallback can still use `window.innerWidth`
- `frontend/src/styles/drawer.css`
  - `.sidebar-column` uses `min-width: var(--sidebar-w)` which can force overflow
- `frontend/src/styles/handDock.css`
  - `.hand-dock` enforces `min-width: 1040px`, which is the main reason mobile layouts are unlikely to work today

