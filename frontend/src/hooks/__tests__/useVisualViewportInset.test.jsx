import { describe, it, expect, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVisualViewportInsetCssVar } from '../useVisualViewportInset'

describe('useVisualViewportInsetCssVar', () => {
  const originalVv = window.visualViewport
  const originalInnerHeight = window.innerHeight

  afterEach(() => {
    document.documentElement.style.removeProperty('--vv-keyboard-gap')
    Object.defineProperty(window, 'visualViewport', {
      value: originalVv,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      configurable: true,
      writable: true,
    })
  })

  it('sets --vv-keyboard-gap from keyboard overlap and cleans up on unmount', () => {
    const updateFns = []
    const vv = {
      height: 380,
      offsetTop: 12,
      addEventListener(type, fn) {
        updateFns.push({ type, fn })
      },
      removeEventListener(type, fn) {
        const i = updateFns.findIndex((x) => x.type === type && x.fn === fn)
        if (i >= 0) updateFns.splice(i, 1)
      },
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true })

    const { unmount } = renderHook(() => useVisualViewportInsetCssVar())

    // gap = max(0, innerHeight - vv.height - max(0, offsetTop)) = 500 - 380 - 12 = 108
    expect(document.documentElement.style.getPropertyValue('--vv-keyboard-gap')).toBe('108px')

    Object.defineProperty(window, 'innerHeight', { value: 520, configurable: true })
    vv.height = 400
    vv.offsetTop = 0
    updateFns.filter((x) => x.type === 'resize').forEach((x) => x.fn())
    expect(document.documentElement.style.getPropertyValue('--vv-keyboard-gap')).toBe('120px')

    unmount()
    expect(document.documentElement.style.getPropertyValue('--vv-keyboard-gap')).toBe('')
    expect(updateFns.length).toBe(0)
  })

  it('uses 0px when visualViewport is unavailable', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    const { unmount } = renderHook(() => useVisualViewportInsetCssVar())
    expect(document.documentElement.style.getPropertyValue('--vv-keyboard-gap')).toBe('0px')
    unmount()
  })
})
