import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shouldPromptRotateToLandscape } from '../rotateToPlay'

const geometryOnly = { bypassInputClassCheck: true }

describe('shouldPromptRotateToLandscape (geometry)', () => {
  it('is false in landscape on a phone-sized width', () => {
    expect(shouldPromptRotateToLandscape(844, 390, geometryOnly)).toBe(false)
  })

  it('is true in portrait on a phone-sized viewport', () => {
    expect(shouldPromptRotateToLandscape(390, 844, geometryOnly)).toBe(true)
  })

  it('is false for iPad portrait (narrow edge too large)', () => {
    expect(shouldPromptRotateToLandscape(768, 1024, geometryOnly)).toBe(false)
  })

  it('is false for square', () => {
    expect(shouldPromptRotateToLandscape(600, 600, geometryOnly)).toBe(false)
  })

  it('is false for invalid dimensions', () => {
    expect(shouldPromptRotateToLandscape(0, 100, geometryOnly)).toBe(false)
    expect(shouldPromptRotateToLandscape(NaN, 100, geometryOnly)).toBe(false)
  })
})

describe('shouldPromptRotateToLandscape (input class)', () => {
  const origMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = origMatchMedia
    vi.restoreAllMocks()
  })

  function mockMatchMedia({ hoverNone, pointerCoarse }) {
    window.matchMedia = vi.fn((query) => ({
      matches:
        (query.includes('hover: none') && hoverNone) ||
        (query.includes('pointer: coarse') && pointerCoarse),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }

  it('is false for mouse-first desktop even when the window is tall and narrow', () => {
    mockMatchMedia({ hoverNone: false, pointerCoarse: false })
    expect(shouldPromptRotateToLandscape(500, 900)).toBe(false)
  })

  it('is true for touch-like primary input when portrait and compact', () => {
    mockMatchMedia({ hoverNone: true, pointerCoarse: false })
    expect(shouldPromptRotateToLandscape(390, 844)).toBe(true)
  })
})
