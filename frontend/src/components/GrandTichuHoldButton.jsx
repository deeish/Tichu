import { useRef, useState, useEffect, useCallback } from 'react';

const HOLD_MS = 1500;

/**
 * Declares Grand Tichu only after a continuous press of {@link HOLD_MS} ms.
 * Release or cancel earlier and nothing is submitted.
 */
export function GrandTichuHoldButton({ className, disabled, onCommit, children }) {
  const [progress, setProgress] = useState(0);
  const sessionRef = useRef(0);
  const timeoutRef = useRef(null);
  const rafRef = useRef(null);
  const holdStartRef = useRef(0);

  const cancelHold = useCallback(() => {
    sessionRef.current += 1;
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setProgress(0);
  }, []);

  useEffect(() => {
    if (disabled) cancelHold();
  }, [disabled, cancelHold]);

  useEffect(() => () => cancelHold(), [cancelHold]);

  const handlePointerDown = (e) => {
    if (disabled) return;
    if (e.button != null && e.button !== 0) return;
    cancelHold();
    const sid = sessionRef.current;
    holdStartRef.current = performance.now();
    setProgress(0);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }

    const loop = (now) => {
      if (sessionRef.current !== sid) return;
      const elapsed = now - holdStartRef.current;
      setProgress(Math.min(1, elapsed / HOLD_MS));
      if (sessionRef.current === sid && elapsed < HOLD_MS) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    timeoutRef.current = setTimeout(() => {
      if (sessionRef.current !== sid) return;
      timeoutRef.current = null;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      sessionRef.current += 1;
      setProgress(0);
      onCommit();
    }, HOLD_MS);
  };

  const handlePointerEnd = () => {
    cancelHold();
  };

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label="Grand Tichu, plus 200 points. Press and hold for three seconds to declare."
      title="Hold 3s to declare Grand Tichu (+200)"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{ '--grand-hold-progress': progress }}
    >
      <span className="dock-btn-grand-hold__fill" aria-hidden />
      <span className="dock-btn-grand-hold__label">{children}</span>
    </button>
  );
}
