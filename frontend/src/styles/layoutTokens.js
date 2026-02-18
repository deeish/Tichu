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

// Dock height: clamp(180px, 22vh, 240px)
export function getDockHeight() {
  if (typeof window === 'undefined') return 200;
  const vh = window.innerHeight * 0.22;
  return Math.min(240, Math.max(180, vh));
}

// Right band = same as left (space for right seat). Sidebar is in a separate grid column, so we do not subtract its width from the table column.
export function getRightBand(_drawerWidth) {
  return LEFT_BAND;
}

// Center rect inside table (safe area for play mat)
export function getCenterRect(tableW, tableH, dockH, drawerW) {
  const rightBand = getRightBand(drawerW);
  const bottomBand = dockH + OUTER_MARGIN;
  const x = LEFT_BAND;
  const y = TOP_BAND;
  const w = Math.max(0, tableW - LEFT_BAND - rightBand);
  const h = Math.max(0, tableH - TOP_BAND - bottomBand);
  return { x, y, w, h };
}

// Play mat size: smaller, ~52% centerW x ~42% centerH for better centering and less space
export function getMatSize(centerW, centerH) {
  const matW = Math.min(680, Math.max(520, centerW * 0.52));
  const matH = Math.min(380, Math.max(280, centerH * 0.42));
  return { w: matW, h: matH };
}

// Play mat vertical position: fraction of (centerRect height - mat height) from the top of the center rect.
// Tune this to move the mat up/down: 0.5 = centered, 0.6 = lower, 0.7 = more room above / fill below.
export const MAT_VERTICAL_BIAS = 0.90;

// Extra pixels added to the playmat div's "top" (CSS). Increase this to lower the mat and give more room for the top seat.
export const MAT_TOP_OFFSET = 65;

export function getMatPosition(centerRect, matW, matH) {
  const y = centerRect.y + (centerRect.h - matH) * MAT_VERTICAL_BIAS + MAT_TOP_OFFSET;
  return {
    x: centerRect.x + (centerRect.w - matW) / 2,
    y,
  };
}

// Seat anchor positions (absolute within table). Centered with the play mat.
// matPosition/matSize are used so top seat aligns with mat horizontal center, left/right with mat vertical center.
export function getSeatPositions(tableW, _tableH, _dockH, _drawerW, matPosition, matSize) {
  const rightX = tableW - OUTER_MARGIN - SEAT_WIDTH;
  const topSeatY = TABLE_HEADER_HEIGHT + TABLE_HEADER_SEAT_GAP;
  const matCenterX = matPosition.x + matSize.w / 2;
  const matCenterY = matPosition.y + matSize.h / 2;
  return {
    top: { x: Math.round(matCenterX - SEAT_WIDTH / 2), y: topSeatY },
    left: { x: OUTER_MARGIN, y: Math.round(matCenterY - SEAT_HEIGHT / 2) },
    right: { x: Math.max(LEFT_BAND + 16, rightX), y: Math.round(matCenterY - SEAT_HEIGHT / 2) },
  };
}

// Card dimensions by breakpoint (for play mat / general use)
export function getCardSize(containerWidth) {
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

// Max hand size is 14; show all cards (no overflow stack)
export const MAX_HAND_CAP = 14;

export function getVisibleHandCap(containerWidth) {
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
  return HAND_RAIL_STEP;
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
