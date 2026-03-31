import { useEffect } from 'react'

/**
 * Sets `--vv-keyboard-gap` on `document.documentElement` from VisualViewport so fixed
 * footers (landing, chat input) can clear the on-screen keyboard on mobile.
 */
export function useVisualViewportInsetCssVar() {
  useEffect(() => {
    const root = document.documentElement
    if (typeof window === 'undefined') {
      root.style.setProperty('--vv-keyboard-gap', '0px')
      return
    }
    const vv = window.visualViewport
    if (!vv) {
      root.style.setProperty('--vv-keyboard-gap', '0px')
      return
    }
    const update = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - Math.max(0, vv.offsetTop))
      root.style.setProperty('--vv-keyboard-gap', `${gap}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--vv-keyboard-gap')
    }
  }, [])
}
