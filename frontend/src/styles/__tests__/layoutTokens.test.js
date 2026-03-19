import { describe, it, expect } from 'vitest';
import {
  getMatSize,
  getMatPosition,
  getSeatPositions,
  getSidebarLayoutMode,
  getSidebarWidth,
  getVisibleHandCap,
  getHandRailStep,
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
});

