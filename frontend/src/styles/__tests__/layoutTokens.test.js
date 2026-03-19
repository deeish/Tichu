import { describe, it, expect } from 'vitest';
import { getMatSize, getMatPosition, getSeatPositions } from '../layoutTokens';

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
});

