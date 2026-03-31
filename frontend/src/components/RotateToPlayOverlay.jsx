import { useRotateToPlayGate } from '../hooks/useRotateToPlayGate'
import './RotateToPlayOverlay.css'

/**
 * Full-screen gate during active play when the viewport is phone portrait.
 * Copy is intentional: users must understand the table will not work until they rotate.
 */
export default function RotateToPlayOverlay({ active }) {
  const show = useRotateToPlayGate(active)
  if (!show) return null

  return (
    <div
      className="rotate-to-play-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="rotate-to-play-title"
      aria-describedby="rotate-to-play-desc"
    >
      <div className="rotate-to-play-inner">
        <div className="rotate-to-play-icon" aria-hidden>
          <span className="rotate-to-play-phone" />
          <span className="rotate-to-play-curve" />
        </div>
        <h1 id="rotate-to-play-title" className="rotate-to-play-title">
          Turn your phone
        </h1>
        <p id="rotate-to-play-desc" className="rotate-to-play-desc">
          Tichu needs <strong>landscape</strong>. The table and your hand will not fit like this — rotate your
          device to continue.
        </p>
        <p className="rotate-to-play-hint">Nothing is wrong; we’ll unlock as soon as you’re sideways.</p>
      </div>
    </div>
  )
}
