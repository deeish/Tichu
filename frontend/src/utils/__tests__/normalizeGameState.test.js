import { describe, it, expect } from 'vitest'
import { normalizeGameState } from '../normalizeGameState'

describe('normalizeGameState', () => {
  it('returns non-objects unchanged', () => {
    expect(normalizeGameState(null)).toBeNull()
    expect(normalizeGameState(undefined)).toBeUndefined()
    expect(normalizeGameState('x')).toBe('x')
  })

  it('normalizes missing top-level containers to safe defaults', () => {
    const input = { state: 'playing', turnOrder: null }
    const out = normalizeGameState(input)

    expect(out.players).toEqual([])
    expect(out.turnOrder).toEqual([])
    expect(Array.isArray(out.currentTrick)).toBe(true)
    expect(Array.isArray(out.passedPlayers)).toBe(true)
    expect(Array.isArray(out.roundLog)).toBe(true)
    expect(typeof out.playerStacks === 'object' || out.playerStacks == null).toBe(true)
    expect(out.currentPlayerIndex).toBe(0)
  })

  it('sanitizes currentTrick: filters invalid entries and caps cards per play', () => {
    const input = {
      players: [],
      turnOrder: [{ id: 'p1', team: 1 }],
      currentPlayerIndex: 0,
      currentTrick: [
        { playerId: 'p1', cards: [{ name: 'x' }] },
        { playerId: null, cards: [{ name: 'y' }] },
        { playerId: 'p2', cards: 'not-array' },
        { playerId: 'p3', cards: Array.from({ length: 50 }, (_, i) => ({ name: `c${i}` })) },
      ],
      passedPlayers: null,
      roundLog: null,
      trickHistory: null,
      hands: null,
      playerStacks: null,
    }

    const out = normalizeGameState(input)
    expect(out.currentTrick.length).toBe(2)
    // The last play should be capped to 20 cards
    expect(out.currentTrick[1].cards.length).toBeLessThanOrEqual(20)
    expect(out.currentTrick.every((p) => p.playerId != null && Array.isArray(p.cards))).toBe(true)
  })

  it('sanitizes roundLog entries: guarantees entry.players is an array', () => {
    const input = {
      players: [],
      turnOrder: [],
      roundLog: [
        { round: 1, players: null },
        { round: 2 },
        null,
        'bad',
      ],
    }
    const out = normalizeGameState(input)
    expect(out.roundLog.length).toBe(2)
    expect(Array.isArray(out.roundLog[0].players)).toBe(true)
    expect(Array.isArray(out.roundLog[1].players)).toBe(true)
  })

  it('caps oversized arrays to avoid UI/clone freeze', () => {
    const input = {
      players: [],
      turnOrder: [],
      roundLog: Array.from({ length: 200 }, (_, i) => ({ round: i, players: [] })),
      playerStacks: {
        p1: { cards: Array.from({ length: 500 }, () => ({ name: 'c' })), points: 3 },
      },
      hands: {
        p1: Array.from({ length: 200 }, () => ({ name: 'c' })),
      },
      trickHistory: Array.from({ length: 300 }, () => ({ x: 1 })),
      currentTrick: [],
      passedPlayers: [],
    }

    const out = normalizeGameState(input)
    expect(out.roundLog.length).toBeLessThanOrEqual(80)
    expect(out.playerStacks.p1.cards.length).toBeLessThanOrEqual(56)
    expect(out.hands.p1.length).toBeLessThanOrEqual(56)
    expect(out.trickHistory.length).toBeLessThanOrEqual(100)
  })

  it('never throws on weird shapes', () => {
    expect(() => {
      normalizeGameState({ players: 123, turnOrder: 'x', currentTrick: {}, roundLog: [1, 2, 3] })
    }).not.toThrow()
  })
})

