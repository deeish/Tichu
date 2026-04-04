/**
 * UI layout constants and computed values.
 * Use these everywhere for spacing, sizing, and layout math.
 */

// Spacing scale (px)
export const SPACING = [4, 8, 12, 16, 20, 24, 32];
export const [s4, s8, s12, s16, s20, s24, s32] = SPACING;

// Radii (px)
export const RADIUS_PANEL = 12;
export const RADIUS_DOCK = 16;
export const RADIUS_PILL = 999;

// Fixed structural sizes (px)
export const HUD_HEIGHT = 64;
export const SEAT_WIDTH = 200;
export const SEAT_HEIGHT = 52;
export const DRAWER_OPEN_WIDTH = 320;
export const DRAWER_COLLAPSED_WIDTH = 56;
export const OUTER_MARGIN = 20;
export const SEAT_MAT_GAP = 12;
export const TABLE_HEADER_HEIGHT = 88; // title + current move line above top seat (was 52; increased to fit both)
export const TABLE_HEADER_SEAT_GAP = 8;
export const CARD_BACK_W = 56;
export const CARD_BACK_H = 80;
export const STACK_OFFSET = 6;
export const STACK_MAX_BACKS = 7;
export const WON_STACK_GAP = 8; // gap between seat panel and "won" cards pile

// Max won-pile card height across getCardSize breakpoints (92/104/116 * 0.7 → 64/73/81). Use max so all viewports are safe.
const MAX_WON_PILE_CARD_H = Math.round(116 * 0.7);
/** Reserve at bottom of table for "my won cards" slot. Play mat must stop above this on all screen sizes. */
export const BOTTOM_BAND_FOR_WON_CARDS = MAX_WON_PILE_CARD_H + WON_STACK_GAP + OUTER_MARGIN;

/** Vertical offset from top of table surface for the wished-card panel (works at any viewport size) */
export const WISHED_CARD_PANEL_TOP = 12;

/**
 * Compact tier classifier (single source of truth for phone-landscape sizing).
 * - regular: desktop/tablet/default
 * - compact: phone-class landscape with short viewport
 * - short: extra-short phone landscape
 */
export function getCompactTier(viewportW, viewportH) {
  if (!Number.isFinite(viewportW) || !Number.isFinite(viewportH) || viewportW <= 0 || viewportH <= 0) return 'regular';
  const isLandscape = viewportW > viewportH;
  const phoneLandscapeCompact = isLandscape && viewportH <= 430 && viewportW <= 980;
  if (!phoneLandscapeCompact) return 'regular';
  if (viewportH <= 390) return 'short';
  return 'compact';
}

/**
 * Prefer visualViewport; SSR-safe fallback.
 * @returns {{ w: number, h: number }}
 */
export function getVisualViewportSize() {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  const vv = window.visualViewport;
  const w = Number.isFinite(vv?.width) ? vv.width : window.innerWidth;
  const h = Number.isFinite(vv?.height) ? vv.height : window.innerHeight;
  return { w, h };
}

/**
 * Height used for phone card budget: min(visual viewport height, caller hint) so table-basis height
 * matches what GameBoard passes while respecting address-bar shrink when vv is smaller.
 * @param {number|undefined} layoutHeightHint — e.g. tableContainerHeightBasis from GameBoard
 */
export function getBudgetViewportHeight(layoutHeightHint) {
  if (typeof window === 'undefined') {
    return Number.isFinite(layoutHeightHint) && layoutHeightHint > 0 ? layoutHeightHint : 400;
  }
  const { h: vvH } = getVisualViewportSize();
  if (Number.isFinite(layoutHeightHint) && layoutHeightHint > 0) {
    return Math.min(vvH, layoutHeightHint);
  }
  return vvH;
}

/** Standard playing-card aspect width:height ≈ 5:7 */
const CARD_ASPECT_W = 5;
const CARD_ASPECT_H = 7;

/**
 * Max card dimensions on phone landscape from visible viewport height (see MOBILE_SCALE_EXECUTION_PLAN.md).
 * @param {number} vvH — effective visible height (px)
 * @returns {{ maxCardH: number, maxCardW: number }}
 */
export function getPhoneCardBudgetPx(vvH) {
  if (!Number.isFinite(vvH) || vvH <= 0) return { maxCardH: 40, maxCardW: 29 };
  // ~7.8% of visible height, capped so hand + dock do not dominate landscape phones (see WEB_MOBILE_PLAN).
  const raw = vvH * 0.078;
  const maxCardH = Math.round(Math.min(44, Math.max(28, raw)));
  const maxCardW = Math.round((maxCardH * CARD_ASPECT_W) / CARD_ASPECT_H);
  return { maxCardH, maxCardW };
}

function clampCardToPhoneBudget(w, h, viewportHeightHint) {
  const vvEff = getBudgetViewportHeight(viewportHeightHint);
  const { maxCardH, maxCardW } = getPhoneCardBudgetPx(vvEff);
  let ch = Math.min(h, maxCardH);
  let cw = Math.round((ch * CARD_ASPECT_W) / CARD_ASPECT_H);
  if (cw > maxCardW) {
    cw = maxCardW;
    ch = Math.round((cw * CARD_ASPECT_H) / CARD_ASPECT_W);
  }
  return { w: cw, h: ch };
}

/**
 * Seat panel size by table tier.
 * Keep desktop unchanged; compact only on short phone-class landscape viewports.
 */
export function getSeatSize(tableW, tableH) {
  const tier = getCompactTier(tableW, tableH);
  if (tier === 'short') return { w: 132, h: 34 };
  if (tier === 'compact') return { w: 148, h: 38 };
  return { w: SEAT_WIDTH, h: SEAT_HEIGHT };
}

function getTopBand(tableW, tableH) {
  const seat = getSeatSize(tableW, tableH);
  const tier = getCompactTier(tableW, tableH);
  // Extra space below the top seat on phone landscape so play mat / trick sit clear of nameplates.
  const seatMatGapBoost = tier === 'short' ? 16 : tier === 'compact' ? 12 : 0;
  return TABLE_HEADER_HEIGHT + TABLE_HEADER_SEAT_GAP + seat.h + SEAT_MAT_GAP + seatMatGapBoost;
}

function getLeftBand(tableW, tableH) {
  const seat = getSeatSize(tableW, tableH);
  return OUTER_MARGIN + seat.w + SEAT_MAT_GAP;
}

// Sidebar behavior: desktop side-by-side, mobile overlay.
export const SIDEBAR_OVERLAY_BREAKPOINT = 1180;
export function getSidebarLayoutMode(viewportW) {
  if (typeof viewportW !== 'number' || viewportW <= 0) return 'side';
  return viewportW < SIDEBAR_OVERLAY_BREAKPOINT ? 'overlay' : 'side';
}

export function getSidebarWidth(viewportW) {
  if (getSidebarLayoutMode(viewportW) === 'overlay') return 0;
  // Keep desktop sidebar visually close to current 320px, but allow controlled scaling.
  const dynamic = Math.round(viewportW * 0.22);
  return Math.max(280, Math.min(360, dynamic));
}

// Dock height: clamp(180px, 22vh, 240px); phone tiers also capped vs visual viewport (MOBILE_SCALE_EXECUTION_PLAN)
export function getDockHeight() {
  if (typeof window === 'undefined') return 200;
  const { w: viewW, h: viewH } = getVisualViewportSize();
  const tier = getCompactTier(viewW, viewH);
  if (tier === 'compact' || tier === 'short') {
    const vhCompact = viewH * 0.152;
    const maxByTier = tier === 'short' ? 88 : 96;
    const maxByViewport = Math.round(viewH * 0.17);
    const raw = Math.min(maxByTier, Math.max(72, vhCompact));
    return Math.min(raw, maxByViewport);
  }
  const vh = viewH * 0.22;
  return Math.min(240, Math.max(180, vh));
}

// Right band = same as left (space for right seat). Sidebar is in a separate grid column, so we do not subtract its width from the table column.
export function getRightBand(tableW, tableH, _drawerWidth) {
  return getLeftBand(tableW, tableH);
}

// Center rect inside table (safe area for play mat).
// Table column height (tableH) already excludes the hand dock (sibling below .game-main).
// Reserve bottom band for "my won cards" slot so the play mat does not cover it.
export function getCenterRect(tableW, tableH, dockH, drawerW) {
  const leftBand = getLeftBand(tableW, tableH);
  const topBand = getTopBand(tableW, tableH);
  const rightBand = getRightBand(tableW, tableH, drawerW);
  const bottomBand = BOTTOM_BAND_FOR_WON_CARDS;
  const x = leftBand;
  const y = topBand;
  const w = Math.max(0, tableW - leftBand - rightBand);
  const h = Math.max(0, tableH - topBand - bottomBand);
  return { x, y, w, h };
}

// Play mat size: use most of the center zone (~92% width, ~88% height) so the mat and trick area feel large
export function getMatSize(centerW, centerH) {
  // Play mat must always fit inside the measured center rect.
  // Avoid hard Math.max minimums that can overflow the available space on small/short viewports.
  // Safety margin so borders/absolute children never touch edges.
  // Keep this small: too much margin makes the mat feel "too small" on some screens.
  const epsilon = 2;

  // Width: keep current ratio (user target). Height: use most of center so the mat fills vertical space and removes dead area at bottom.
  const desiredW = centerW * 0.96;
  const desiredH = centerH * 0.97;

  // Preserve the "minimum feel" without overflowing:
  // if the viewport is too small, the available size becomes the effective minimum.
  const minW = Math.min(400, Math.max(0, centerW - epsilon));
  const minH = Math.min(300, Math.max(0, centerH - epsilon));

  const maxW = Math.max(0, centerW - epsilon);
  const maxH = Math.max(0, centerH - epsilon);

  const matW = Math.max(minW, Math.min(desiredW, maxW));
  const matH = Math.max(minH, Math.min(desiredH, maxH));

  return { w: matW, h: matH };
}

// Play mat vertical position: fraction of (centerRect height - mat height) from the top of the center rect.
// Tune this to move the mat up/down: 0.5 = centered, 0.6 = lower, 0.7 = more room above / fill below.
export const MAT_VERTICAL_BIAS = 0.90;

// Extra pixels added to the playmat div's "top" (CSS). Increase this to lower the mat and give more room for the top seat.
export const MAT_TOP_OFFSET = 65;

export function getMatPosition(centerRect, matW, matH, layoutW, layoutH) {
  // Clamp mat position so the mat never visually spills outside the measured center rect.
  const epsilon = 2;

  const tw = layoutW != null && Number.isFinite(layoutW) ? layoutW : 1600;
  const th = layoutH != null && Number.isFinite(layoutH) ? layoutH : 900;
  const tier = getCompactTier(tw, th);
  const topOffset =
    tier === 'short' ? 24 : tier === 'compact' ? 34 : MAT_TOP_OFFSET;

  const desiredX = centerRect.x + (centerRect.w - matW) / 2;
  const desiredY = centerRect.y + (centerRect.h - matH) * MAT_VERTICAL_BIAS + topOffset;

  const minX = centerRect.x + epsilon;
  const maxX = centerRect.x + centerRect.w - matW - epsilon;
  const minY = centerRect.y + epsilon;
  const maxY = centerRect.y + centerRect.h - matH - epsilon;

  // Defensive: if the available rect is extremely small, ensure we don't produce NaN.
  const clampedX = Number.isFinite(maxX) && Number.isFinite(minX) ? Math.max(minX, Math.min(maxX, desiredX)) : desiredX;
  const clampedY = Number.isFinite(maxY) && Number.isFinite(minY) ? Math.max(minY, Math.min(maxY, desiredY)) : desiredY;

  return { x: clampedX, y: clampedY };
}

// Seat anchor positions (absolute within table). Centered with the play mat.
// matPosition/matSize are used so top seat aligns with mat horizontal center, left/right with mat vertical center.
export function getSeatPositions(tableW, _tableH, _dockH, _drawerW, matPosition, matSize) {
  const seat = getSeatSize(tableW, _tableH);
  const rightX = tableW - OUTER_MARGIN - seat.w;
  const tableH = _tableH;
  const seatMinY = 0;
  const seatMaxY = Math.max(0, tableH - seat.h);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const topSeatY = TABLE_HEADER_HEIGHT + TABLE_HEADER_SEAT_GAP;
  const matCenterX = matPosition.x + matSize.w / 2;
  const matCenterY = matPosition.y + matSize.h / 2;

  const seatMinX = OUTER_MARGIN;
  const seatMaxX = Math.max(0, tableW - OUTER_MARGIN - seat.w);

  const leftSeatX = clamp(OUTER_MARGIN, seatMinX, seatMaxX);
  const leftSeatY = clamp(Math.round(matCenterY - seat.h / 2), seatMinY, seatMaxY);

  const topSeatX = clamp(Math.round(matCenterX - seat.w / 2), seatMinX, seatMaxX);
  const topSeatYClamped = clamp(topSeatY, seatMinY, seatMaxY);

  const rightSeatX = clamp(Math.max(getLeftBand(tableW, _tableH) + 16, rightX), seatMinX, seatMaxX);
  const rightSeatY = leftSeatY;

  return {
    top: { x: topSeatX, y: topSeatYClamped },
    left: { x: leftSeatX, y: leftSeatY },
    right: { x: rightSeatX, y: rightSeatY },
  };
}

/** Trick / table vs full card on phone (shared budget from getPhoneCardBudgetPx). */
const PHONE_TRICK_TO_FULL_RATIO = 0.64;

// Card dimensions by breakpoint (for play mat / general use)
export function getCardSize(containerWidth, viewportHeight) {
  const tier = getCompactTier(containerWidth, viewportHeight);
  if (tier === 'short' || tier === 'compact') {
    const { maxCardW, maxCardH } = getPhoneCardBudgetPx(getBudgetViewportHeight(viewportHeight));
    return { w: maxCardW, h: maxCardH };
  }
  if (containerWidth <= 1280) return { w: 64, h: 92 };
  if (containerWidth >= 1600) return { w: 80, h: 116 };
  return { w: 72, h: 104 };
}

// Smaller cards for played tricks so multiple fit on the table
export function getTrickCardSize(containerWidth, viewportHeight) {
  const tier = getCompactTier(containerWidth, viewportHeight);
  if (tier === 'short' || tier === 'compact') {
    const full = getCardSize(containerWidth, viewportHeight);
    return {
      w: Math.max(22, Math.round(full.w * PHONE_TRICK_TO_FULL_RATIO)),
      h: Math.max(30, Math.round(full.h * PHONE_TRICK_TO_FULL_RATIO)),
    };
  }
  const full = getCardSize(containerWidth, viewportHeight);
  return { w: Math.round(full.w * 0.6), h: Math.round(full.h * 0.6) };
}

// Slightly smaller cards in the hand dock so rail + actions + hint fit without overflow
export function getDockCardSize(containerWidth, viewportHeight) {
  const tier = getCompactTier(containerWidth, viewportHeight);
  if (tier === 'short') {
    return clampCardToPhoneBudget(30, 42, viewportHeight);
  }
  if (tier === 'compact') {
    return clampCardToPhoneBudget(32, 46, viewportHeight);
  }
  const full = getCardSize(containerWidth, viewportHeight);
  return { w: Math.round(full.w * 0.88), h: Math.round(full.h * 0.88) };
}

// Won pile and trick display (same size so won cards match the pile)
export function getWonPileCardSize(containerWidth, viewportHeight) {
  const full = getCardSize(containerWidth, viewportHeight);
  const scale = 0.7;
  return { w: Math.round(full.w * scale), h: Math.round(full.h * scale) };
}

// Tiny cards for exchange/seat display (scale from base so they stay proportional and visible)
export function getExchangeCardSize(containerWidth, viewportHeight) {
  const full = getCardSize(containerWidth, viewportHeight);
  const scale = 0.32;
  return {
    w: Math.max(10, Math.round(full.w * scale)),
    h: Math.max(14, Math.round(full.h * scale)),
  };
}

// Max hand size is 14; show all cards (no overflow stack)
export const MAX_HAND_CAP = 14;

export function getVisibleHandCap(containerWidth) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return MAX_HAND_CAP;
  if (containerWidth < 640) return 9;
  if (containerWidth < 760) return 10;
  if (containerWidth < 920) return 11;
  if (containerWidth < 1120) return 12;
  if (containerWidth < 1280) return 13;
  return MAX_HAND_CAP;
}

// Dock width clamp: small 920–1120, baseline/wide up to 1240
export function getDockWidthClamp(containerWidth) {
  if (containerWidth <= 1280) return { min: 920, max: 1120 };
  return { min: 1040, max: 1240 };
}

// Hand rail: horizontal distance between cards (px); 60 so 14 cards fit in the rail without clipping
export const HAND_RAIL_STEP = 65;

export function getHandRailStep(railW, cardW, visibleCount) {
  if (visibleCount <= 1) return 0;
  if (!Number.isFinite(railW) || railW <= 0 || !Number.isFinite(cardW) || cardW <= 0) return HAND_RAIL_STEP;
  // Scale preferred overlap with card width so larger cards on wide screens don't look overly stacked.
  const preferredStep = Math.max(28, Math.min(86, Math.round(cardW * 0.95)));
  const fitStep = (railW - cardW) / (visibleCount - 1);
  // Never exceed preferred spacing. Allow tight spacing on narrow docks so cards stay on-rail.
  return Math.max(0, Math.min(preferredStep, Math.floor(fitStep)));
}

// Z-index hierarchy
export const Z = {
  TABLE_SURFACE: 0,
  CENTER_MAT: 1,
  SEATS_AND_PILES: 2,
  HAND_DOCK: 3,
  HOVER_PREVIEW: 4,
  TOOLTIPS: 5,
  MODALS: 6,
};
