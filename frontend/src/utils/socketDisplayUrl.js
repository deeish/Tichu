/** URL shown in connection errors (matches `VITE_SOCKET_URL` / socket client). */
export function getSocketDisplayUrl() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL) {
      return String(import.meta.env.VITE_SOCKET_URL).replace(/\/$/, '')
    }
  } catch (_) {}
  return 'http://localhost:3001'
}
