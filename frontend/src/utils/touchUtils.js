export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  return 'ontouchstart' in window;
}
