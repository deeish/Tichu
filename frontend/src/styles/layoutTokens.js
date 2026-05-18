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
export const TOP_BAND = TABLE_HEADER_HEIGHT + TABLE_HEADER_SEAT_GAP + SEAT_HEIGHT + SEAT_MAT_GAP; // header + gap + top seat + gap to mat
export const LEFT_BAND = OUTER_MARGIN + SEAT_WIDTH + SEAT_MAT_GAP;
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

// Dock height: mobile min raised to fit two-row card layout (cards × 2 + actions)
export function getDockHeight() {
  if (typeof window === 'undefined') return 200;
  const vh = window.innerHeight * 0.22;
  const minH = window.innerWidth < 480 ? 240 : 180;
  const maxH = window.innerWidth < 480 ? 300 : 240;
  return Math.min(maxH, Math.max(minH, vh));
}

// Right band = same as left (space for right seat). Sidebar is in a separate grid column, so we do not subtract its width from the table column.
export function getRightBand(_drawerWidth) {
  return LEFT_BAND;
}

// Center rect inside table (safe area for play mat).
// Table column height (tableH) already excludes the hand dock (sibling below .game-main).
// Reserve bottom band for "my won cards" slot so the play mat does not cover it.
// Pass overrides.leftBand / overrides.topBand to use mobile-scaled values without touching static constants.
export function getCenterRect(tableW, tableH, dockH, drawerW, overrides = {}) {
  const leftBand = overrides.leftBand ?? LEFT_BAND;
  const topBand = overrides.topBand ?? TOP_BAND;
  const rightBand = overrides.leftBand ?? getRightBand(drawerW);
  const bottomBand = overrides.bottomBand ?? BOTTOM_BAND_FOR_WON_CARDS;
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

export function getMatPosition(centerRect, matW, matH) {
  // Clamp mat position so the mat never visually spills outside the measured center rect.
  const epsilon = 2;

  const desiredX = centerRect.x + (centerRect.w - matW) / 2;
  const desiredY = centerRect.y + (centerRect.h - matH) * MAT_VERTICAL_BIAS + MAT_TOP_OFFSET;

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
// Pass overrides (seatWidth, seatHeight, outerMargin, tableHeaderHeight, leftBand) to use mobile-scaled values.
export function getSeatPositions(tableW, _tableH, _dockH, _drawerW, matPosition, matSize, overrides = {}) {
  const seatW = overrides.seatWidth ?? SEAT_WIDTH;
  const seatH = overrides.seatHeight ?? SEAT_HEIGHT;
  const outerMargin = overrides.outerMargin ?? OUTER_MARGIN;
  const headerH = overrides.tableHeaderHeight ?? TABLE_HEADER_HEIGHT;
  const leftBand = overrides.leftBand ?? LEFT_BAND;

  const seatWSide = overrides.seatWidthSide ?? seatW;
  const seatHSide = overrides.seatHeightSide ?? seatH;
  const rightX = tableW - outerMargin - seatWSide;
  const tableH = _tableH;
  const seatMinY = 0;
  const seatMaxY = Math.max(0, tableH - seatH);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const topSeatY = headerH + TABLE_HEADER_SEAT_GAP;
  const matCenterX = matPosition.x + matSize.w / 2;
  const matCenterY = matPosition.y + matSize.h / 2;

  const seatMinX = outerMargin;
  const seatMaxX = Math.max(0, tableW - outerMargin - seatWSide);

  const leftSeatX = clamp(outerMargin, seatMinX, seatMaxX);
  const leftSeatY = clamp(Math.round(matCenterY - seatHSide / 2), seatMinY, Math.max(0, tableH - seatHSide));

  const topSeatX = clamp(Math.round(matCenterX - seatW / 2), seatMinX, seatMaxX);
  const topSeatYClamped = clamp(topSeatY, seatMinY, seatMaxY);

  const rightSeatX = clamp(Math.max(leftBand + 16, rightX), seatMinX, seatMaxX);
  const rightSeatY = leftSeatY;

  return {
    top: { x: topSeatX, y: topSeatYClamped },
    left: { x: leftSeatX, y: leftSeatY },
    right: { x: rightSeatX, y: rightSeatY },
  };
}

// Card dimensions by breakpoint (for play mat / general use)
export function getCardSize(containerWidth) {
  if (containerWidth < 480) return { w: 38, h: 54 };
  if (containerWidth <= 1280) return { w: 64, h: 92 };
  if (containerWidth >= 1600) return { w: 80, h: 116 };
  return { w: 72, h: 104 };
}

// Smaller cards for played tricks so multiple fit on the table
export function getTrickCardSize(containerWidth) {
  const full = getCardSize(containerWidth);
  return { w: Math.round(full.w * 0.6), h: Math.round(full.h * 0.6) };
}

// Slightly smaller cards in the hand dock so rail + actions + hint fit without overflow
export function getDockCardSize(containerWidth) {
  const full = getCardSize(containerWidth);
  return { w: Math.round(full.w * 0.88), h: Math.round(full.h * 0.88) };
}

// Won pile and trick display (same size so won cards match the pile)
export function getWonPileCardSize(containerWidth) {
  const full = getCardSize(containerWidth);
  const scale = 0.7;
  return { w: Math.round(full.w * scale), h: Math.round(full.h * scale) };
}

// Tiny cards for exchange/seat display (scale from base so they stay proportional and visible)
export function getExchangeCardSize(containerWidth) {
  const full = getCardSize(containerWidth);
  const scale = 0.32;
  return { w: Math.round(full.w * scale), h: Math.round(full.h * scale) };
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

// Two-row mode: on narrow mobile viewports show cards in two rows of 7 so all fit without scrolling.
export function isHandTwoRow(viewportW, cardCount) {
  return Number.isFinite(viewportW) && viewportW < 640 && cardCount > 8;
}

export function getHandRailStep(railW, cardW, visibleCount) {
  if (visibleCount <= 1) return 0;
  if (!Number.isFinite(railW) || railW <= 0 || !Number.isFinite(cardW) || cardW <= 0) return HAND_RAIL_STEP;
  // Scale preferred overlap with card width so larger cards on wide screens don't look overly stacked.
  const preferredStep = Math.max(66, Math.min(86, Math.round(cardW * 1.08)));
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

// Mobile-aware layout tokens: returns scaled values for viewportW < 600, static constants otherwise.
// Desktop (>= 600px): identical to the static constants — zero change to layout.
// Mobile (< 600px): proportionally scaled so seat panels don't overflow narrow screens.
// Also computes mobileLeftBand / mobileTopBand for passing to getCenterRect and getSeatPositions.
export function getMobileAwareTokens(viewportW) {
  if (!Number.isFinite(viewportW) || viewportW >= 600) {
    return {
      seatWidth: SEAT_WIDTH,
      seatHeight: SEAT_HEIGHT,
      tableHeaderHeight: TABLE_HEADER_HEIGHT,
      outerMargin: OUTER_MARGIN,
      leftBand: LEFT_BAND,
      topBand: TOP_BAND,
    };
  }
  const scale = Math.max(0.5, viewportW / 600);
  let seatWidth = Math.round(SEAT_WIDTH * scale);
  const seatHeight = Math.round(SEAT_HEIGHT * scale);
  const tableHeaderHeight = Math.min(TABLE_HEADER_HEIGHT, 80);
  const outerMargin = Math.round(OUTER_MARGIN * scale);
  // Cap seatWidth so 3 chips fit side-by-side with 8px gaps on very narrow screens
  if (viewportW < 480) {
    seatWidth = Math.min(seatWidth, Math.floor((viewportW - 2 * outerMargin - 16) / 3));
  }
  const leftBand = outerMargin + seatWidth + SEAT_MAT_GAP;
  const topBand = tableHeaderHeight + TABLE_HEADER_SEAT_GAP + seatHeight + SEAT_MAT_GAP;
  // Narrower band for mat sizing on mobile — seats overlap mat edges (seats have higher z-index)
  const centerBand = outerMargin + Math.round(seatWidth * 0.4) + SEAT_MAT_GAP;
  const seatWidthSide  = viewportW < 480 ? 56  : seatWidth;
  const seatHeightSide = viewportW < 480 ? 88  : seatHeight;
  const centerBandSide = viewportW < 480
    ? outerMargin + seatWidthSide
    : centerBand;
  // Mobile won pile cards are much smaller; use actual height so the mat can grow downward
  const { h: cardH } = getCardSize(viewportW);
  const mobileBotBand = viewportW < 480
    ? Math.round(cardH * 0.7) + WON_STACK_GAP + outerMargin
    : undefined;
  return { seatWidth, seatHeight, tableHeaderHeight, outerMargin, leftBand, topBand,
           centerBand, centerBandSide, seatWidthSide, seatHeightSide, mobileBotBand };
}
