import { useEffect, useRef } from 'react'
import { isTouchPrimaryInput } from '../utils/inputCapabilities'

function getViewportSize() {
  if (typeof window === 'undefined') return { w: 0, h: 0 }
  const vv = window.visualViewport
  const w = Number.isFinite(vv?.width) ? vv.width : window.innerWidth
  const h = Number.isFinite(vv?.height) ? vv.height : window.innerHeight
  return { w, h }
}

function isLandscapeViewport() {
  const { w, h } = getViewportSize()
  return w > h
}

async function requestFullscreenSafe() {
  if (typeof document === 'undefined') return false
  if (document.fullscreenElement) return true
  const root = document.documentElement
  if (!root || typeof root.requestFullscreen !== 'function') return false
  try {
    await root.requestFullscreen({ navigationUI: 'hide' })
    return true
  } catch (_) {
    return false
  }
}

/**
 * Best-effort mobile fullscreen:
 * - auto-attempts when active game enters landscape on touch-primary devices
 * - retries on orientation/resize and first pointer-up gestures when allowed by browser policy
 */
export function useAutoLandscapeFullscreen(active) {
  const lockedRef = useRef(false)

  useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof document === 'undefined') {
      lockedRef.current = false
      return
    }
    if (!isTouchPrimaryInput()) return

    let disposed = false
    let inFlight = false

    const tryFullscreen = async () => {
      if (disposed || inFlight || lockedRef.current) return
      if (!isLandscapeViewport()) return
      inFlight = true
      const ok = await requestFullscreenSafe()
      if (ok) lockedRef.current = true
      inFlight = false
    }

    void tryFullscreen()
    const onChange = () => { void tryFullscreen() }
    window.addEventListener('orientationchange', onChange)
    window.addEventListener('resize', onChange)
    window.addEventListener('pointerup', onChange, { passive: true })

    return () => {
      disposed = true
      window.removeEventListener('orientationchange', onChange)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('pointerup', onChange)
    }
  }, [active])
}

