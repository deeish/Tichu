import { useState, useEffect } from 'react'
import { shouldPromptRotateToLandscape } from '../utils/rotateToPlay'

/**
 * While `active`, tracks viewport and returns true when the rotate overlay should cover the game.
 */
export function useRotateToPlayGate(active) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) {
      setShow(false)
      return
    }

    const update = () => {
      setShow(shouldPromptRotateToLandscape(window.innerWidth, window.innerHeight))
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [active])

  return show
}
