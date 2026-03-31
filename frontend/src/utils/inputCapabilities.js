/**
 * True when the browser reports touch-style primary interaction (typical phones / tablets).
 * Mouse-first desktops usually have hover + fine pointer — used to avoid misleading UX
 * (e.g. rotate prompt) and to turn off HTML5 drag for exchange where it breaks taps.
 */
export function isTouchPrimaryInput() {
  if (typeof window === 'undefined') return false;
  try {
    const mq = window.matchMedia;
    if (typeof mq !== 'function') return false;
    return mq('(hover: none)').matches || mq('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
