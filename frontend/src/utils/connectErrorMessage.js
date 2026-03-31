import { getSocketDisplayUrl } from './socketDisplayUrl'

/**
 * @param {unknown} err — Socket.IO `connect_error` argument (usually Error)
 * @returns {{ hint: string, technical: string, url: string }}
 */
export function parseConnectError(err) {
  const technical =
    err && typeof err === 'object' && typeof err.message === 'string'
      ? err.message.trim()
      : typeof err === 'string'
        ? err.trim()
        : 'Connection failed'

  const lower = technical.toLowerCase()
  let hint = 'Check your network and try again.'
  if (lower.includes('xhr poll') || lower.includes('websocket error') || lower.includes('network error')) {
    hint = 'Network or firewall may be blocking the connection.'
  }
  if (lower.includes('refused') || lower.includes('econnrefused')) {
    hint = 'Server may be offline or sleeping — confirm the deploy URL and env (see docs).'
  }
  if (lower.includes('ssl') || lower.includes('certificate') || lower.includes('tls') || lower.includes('err_ssl')) {
    hint = 'HTTPS / certificate problem — socket URL must match the deployed API (wss vs https).'
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    hint = 'Connection timed out — poor signal or server not responding.'
  }

  return { hint, technical, url: getSocketDisplayUrl() }
}

/** Multi-line copy for toast (use with `white-space: pre-line`). */
export function formatConnectErrorToast(err) {
  const { hint, technical, url } = parseConnectError(err)
  return `Can't reach the game server.\n${hint}\nAddress: ${url}\n(${technical})`
}

/** Short line for landing / lobby subtitle. */
export function formatConnectErrorSubtitle(err) {
  const { hint, url } = parseConnectError(err)
  return `Can't connect — ${hint} (${url})`
}
