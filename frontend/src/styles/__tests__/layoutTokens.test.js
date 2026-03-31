import { describe, it, expect } from 'vitest';
import {
  getCenterRect,
  getMatSize,
  getMatPosition,
  getSeatPositions,
  getSidebarLayoutMode,
  getSidebarWidth,
  getVisibleHandCap,
  getHandRailStep,
  getDockCardSize,
  getExchangeCardSize,
  getDockWidthClamp,
} from '../layoutTokens';

describe('layoutTokens geometry guards', () => {
  it('getMatSize clamps mat dimensions to the available center rect', () => {
    const cases = [
      { w: 1000, h: 700 },
      { w: 800, h: 500 },
      { w: 600, h: 420 },
      { w: 420, h: 320 },
      { w: 520, h: 300 },
      { w: 460, h: 280 },
    ];

    for (const { w: centerW, h: centerH } of cases) {
      const { w, h } = getMatSize(centerW, centerH);
      expect(Number.isFinite(w)).toBe(true);
      expect(Number.isFinite(h)).toBe(true);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(centerW);
      expect(h).toBeLessThanOrEqual(centerH);
    }
  });

  it('getMatPosition keeps the mat fully inside centerRect', () => {
    const centerRect = { x: 10, y: 20, w: 900, h: 600 };
    const { w: matW, h: matH } = getMatSize(centerRect.w, centerRect.h);
    const pos = getMatPosition(centerRect, matW, matH);

    expect(pos.x).toBeGreaterThanOrEqual(centerRect.x);
    expect(pos.y).toBeGreaterThanOrEqual(centerRect.y);
    expect(pos.x + matW).toBeLessThanOrEqual(centerRect.x + centerRect.w);
    expect(pos.y + matH).toBeLessThanOrEqual(centerRect.y + centerRect.h);
  });

  it('getSeatPositions clamps seats within table bounds', () => {
    const tableCases = [
      { w: 1100, h: 700 },
      { w: 900, h: 520 },
      { w: 720, h: 420 },
      { w: 640, h: 360 },
    ];

    for (const { w: tableW, h: tableH } of tableCases) {
      const dockH = 200;
      const drawerW = 320;
      const matPosition = { x: 120, y: 150 };
      const matSize = { w: Math.max(400, tableW * 0.5), h: Math.max(300, tableH * 0.5) };

      const seats = getSeatPositions(tableW, tableH, dockH, drawerW, matPosition, matSize);
      for (const side of Object.keys(seats)) {
        const s = seats[side];
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + 200).toBeLessThanOrEqual(tableW + 1); // SEAT_WIDTH = 200
        expect(s.y + 52).toBeLessThanOrEqual(tableH + 1); // SEAT_HEIGHT = 52
      }
    }
  });

  it('sidebar mode and width are responsive across viewport sizes', () => {
    expect(getSidebarLayoutMode(1600)).toBe('side');
    expect(getSidebarLayoutMode(1024)).toBe('overlay');
    expect(getSidebarWidth(1024)).toBe(0);
    expect(getSidebarWidth(1600)).toBeGreaterThanOrEqual(280);
    expect(getSidebarWidth(1600)).toBeLessThanOrEqual(360);
  });

  it('getHandRailStep shrinks spacing to fit narrow rails', () => {
    const wide = getHandRailStep(1200, 72, 14);
    const narrow = getHandRailStep(420, 72, 14);
    expect(wide).toBeGreaterThan(0);
    expect(wide).toBeLessThanOrEqual(86);
    expect(wide).toBeGreaterThanOrEqual(66);
    expect(narrow).toBeGreaterThanOrEqual(0);
    expect(narrow).toBeLessThanOrEqual(wide);
  });

  it('getVisibleHandCap decreases on narrow widths', () => {
    expect(getVisibleHandCap(1440)).toBe(14);
    expect(getVisibleHandCap(1200)).toBe(13);
    expect(getVisibleHandCap(980)).toBe(12);
    expect(getVisibleHandCap(840)).toBe(11);
    expect(getVisibleHandCap(700)).toBe(10);
    expect(getVisibleHandCap(600)).toBe(9);
  });

  /**
   * Regression matrix for phone-style table/center sizes (not full browser automation).
   * GameBoard measures the table column; center rect is what getMatSize / getMatPosition use.
   */
  it('phone-class center rects: mat + position stay finite and inside center zone', () => {
    const cases = [
      { w: 240, h: 160 },
      { w: 320, h: 200 },
      { w: 420, h: 260 },
      { w: 520, h: 280 },
      { w: 580, h: 300 },
      { w: 640, h: 320 },
      { w: 700, h: 340 },
      { w: 780, h: 360 },
    ];

    for (const { w: cw, h: ch } of cases) {
      const { w: matW, h: matH } = getMatSize(cw, ch);
      const centerRect = { x: 8, y: 72, w: cw, h: ch };
      const pos = getMatPosition(centerRect, matW, matH);

      expect(Number.isFinite(matW), `matW cw=${cw}`).toBe(true);
      expect(Number.isFinite(matH), `matH ch=${ch}`).toBe(true);
      expect(matW).toBeGreaterThan(0);
      expect(matH).toBeGreaterThan(0);
      expect(matW).toBeLessThanOrEqual(cw);
      expect(matH).toBeLessThanOrEqual(ch);

      expect(pos.x + matW).toBeLessThanOrEqual(centerRect.x + centerRect.w + 2);
      expect(pos.y + matH).toBeLessThanOrEqual(centerRect.y + centerRect.h + 2);
    }
  });

  it('phone table sizes: center rect, dock cards, exchange mini-cards stay usable', () => {
    const tableSizes = [
      { tw: 480, th: 320 },
      { tw: 667, th: 375 },
      { tw: 736, th: 414 },
      { tw: 844, th: 390 },
      { tw: 926, th: 428 },
    ];
    const dockH = 200;
    const drawerW = 0;

    for (const { tw, th } of tableSizes) {
      const center = getCenterRect(tw, th, dockH, drawerW);
      expect(center.w).toBeGreaterThanOrEqual(0);
      expect(center.h).toBeGreaterThanOrEqual(0);

      const basis = Math.max(320, center.w || tw * 0.5);
      const dockCard = getDockCardSize(basis);
      const ex = getExchangeCardSize(basis);
      expect(dockCard.w).toBeGreaterThan(16);
      expect(dockCard.h).toBeGreaterThan(24);
      expect(ex.w).toBeGreaterThan(8);
      expect(ex.h).toBeGreaterThan(12);

      const clamp = getDockWidthClamp(basis);
      expect(clamp.min).toBeGreaterThan(0);
      expect(clamp.max).toBeGreaterThanOrEqual(clamp.min);
    }
  });
});

