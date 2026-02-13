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
export const SEAT_WIDTH = 320;
export const SEAT_HEIGHT = 88;
export const DRAWER_OPEN_WIDTH = 320;
export const DRAWER_COLLAPSED_WIDTH = 56;
export const OUTER_MARGIN = 24;
export const TOP_BAND = 104; // room for top seat + piles
export const SEAT_MAT_GAP = 16;
export const LEFT_BAND = OUTER_MARGIN + SEAT_WIDTH + SEAT_MAT_GAP;
export const CARD_BACK_W = 56;
export const CARD_BACK_H = 80;
export const STACK_OFFSET = 6;
export const STACK_MAX_BACKS = 7;

// Dock height: clamp(180px, 22vh, 240px)
export function getDockHeight() {
  if (typeof window === 'undefined') return 200;
  const vh = window.innerHeight * 0.22;
  return Math.min(240, Math.max(180, vh));
}

// Right band = same as left (space for right seat) + drawer width
export function getRightBand(drawerWidth) {
  return LEFT_BAND + drawerWidth;
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

// Play mat size: clamp(860, 70% centerW, 980) x clamp(420, 52% centerH, 520)
export function getMatSize(centerW, centerH) {
  const matW = Math.min(980, Math.max(860, centerW * 0.7));
  const matH = Math.min(520, Math.max(420, centerH * 0.52));
  return { w: matW, h: matH };
}

// Play mat position (centered in centerRect)
export function getMatPosition(centerRect, matW, matH) {
  return {
    x: centerRect.x + (centerRect.w - matW) / 2,
    y: centerRect.y + (centerRect.h - matH) / 2,
  };
}

// Seat anchor positions (absolute within table).
// tableW is the table-column width only (drawer is in a separate column), so right seat uses tableW - margin - seat.
export function getSeatPositions(tableW, tableH, dockH, drawerW) {
  const seatY = (tableH - SEAT_HEIGHT) / 2;
  const rightX = tableW - OUTER_MARGIN - SEAT_WIDTH;
  return {
    top: { x: Math.round((tableW - SEAT_WIDTH) / 2), y: OUTER_MARGIN },
    left: { x: OUTER_MARGIN, y: Math.round(seatY) },
    right: { x: Math.max(LEFT_BAND + 16, rightX), y: Math.round(seatY) },
  };
}

// Card dimensions by breakpoint (for play mat / general use)
export function getCardSize(containerWidth) {
  if (containerWidth <= 1280) return { w: 64, h: 92 };
  if (containerWidth >= 1600) return { w: 80, h: 116 };
  return { w: 72, h: 104 };
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

// Dock width clamp: small 860–1040, baseline/wide up to 1160
export function getDockWidthClamp(containerWidth) {
  if (containerWidth <= 1280) return { min: 860, max: 1040 };
  return { min: 980, max: 1160 };
}

// Hand rail: horizontal distance between cards (px). Increase step to spread cards out, decrease to pack them.
export const HAND_RAIL_STEP_MIN = 6;
export const HAND_RAIL_STEP_MAX = 50; // ← change this to adjust spacing (e.g. 28 = closer, 40 = more spread)

export function getHandRailStep(railW, cardW, visibleCount) {
  if (visibleCount <= 1) return 0;
  const usableW = railW - cardW;
  const step = usableW / (visibleCount - 1);
  return Math.min(HAND_RAIL_STEP_MAX, Math.max(HAND_RAIL_STEP_MIN, step));
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
