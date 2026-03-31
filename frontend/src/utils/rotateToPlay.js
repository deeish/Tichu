import { isTouchPrimaryInput } from './inputCapabilities';

/**
 * Whether we should show the full-screen "rotate to landscape" gate.
 * Targets phone/portrait: wide tablets (e.g. iPad portrait) are left alone so they can use the table as-is.
 *
 * @param {{ bypassInputClassCheck?: boolean }} [options] - tests: pass `{ bypassInputClassCheck: true }` to assert geometry only.
 */
export function shouldPromptRotateToLandscape(viewportWidth, viewportHeight, options = {}) {
  if (!options.bypassInputClassCheck && !isTouchPrimaryInput()) return false;
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return false;
  if (viewportWidth <= 0 || viewportHeight <= 0) return false;
  const portrait = viewportHeight > viewportWidth;
  const shortSide = Math.min(viewportWidth, viewportHeight);
  const compactEnough = shortSide <= 720;
  return portrait && compactEnough;
}
