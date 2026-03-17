/**
 * Unit tests for capGameForWire (structural limits on wire payloads).
 */
const { capGameForWire } = require('../../game/capGameForWire');

describe('capGameForWire', () => {
  test('caps roundLog to last 80', () => {
    const view = { roundLog: Array(100).fill({ round: 1 }) };
    capGameForWire(view);
    expect(view.roundLog).toHaveLength(80);
  });

  test('caps trickHistory to last 100', () => {
    const view = { trickHistory: Array(150).fill({}) };
    capGameForWire(view);
    expect(view.trickHistory).toHaveLength(100);
  });

  test('caps each hand to 56 cards', () => {
    const view = { hands: { p1: Array(60).fill({}), p2: [] } };
    capGameForWire(view);
    expect(view.hands.p1).toHaveLength(56);
    expect(view.hands.p2).toHaveLength(0);
  });

  test('caps playerStacks.cards to 56 per stack', () => {
    const view = {
      playerStacks: {
        p1: { cards: Array(60).fill({}), points: 10 },
        p2: { cards: Array(5).fill({}), points: 5 }
      }
    };
    capGameForWire(view);
    expect(view.playerStacks.p1.cards).toHaveLength(56);
    expect(view.playerStacks.p1.points).toBe(10);
    expect(view.playerStacks.p2.cards).toHaveLength(5);
  });

  test('returns same view and does not mutate when already within limits', () => {
    const view = { roundLog: [], hands: { p1: [] }, playerStacks: {} };
    const out = capGameForWire(view);
    expect(out).toBe(view);
    expect(view.roundLog).toEqual([]);
  });

  test('returns input for null or non-object', () => {
    expect(capGameForWire(null)).toBe(null);
    expect(capGameForWire(undefined)).toBe(undefined);
  });
});
