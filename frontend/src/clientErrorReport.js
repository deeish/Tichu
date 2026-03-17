/**
 * Sends client errors to the server terminal (socket when connected, fetch POST as fallback).
 * Used by GameErrorBoundary, HandErrorBoundary, and global handlers (window.onerror, unhandledrejection).
 * Check the backend terminal for client error logs.
 *
 * Global crash handling: on uncaught errors we show a DOM-based recovery overlay (no React dependency)
 * so the user can always "Refresh page" instead of the browser tab staying broken or needing a machine restart.
 */
let socketRef = null;
let crashOverlayShown = false;

function getApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL.replace(/\/$/, '');
  }
  return 'http://localhost:3001';
}

function sendToServer(payload) {
  const full = {
    ...payload,
    source: payload.source ?? 'global',
    socketId: socketRef?.id ?? null,
    sentAt: new Date().toISOString(),
  };
  if (socketRef?.connected) {
    try {
      socketRef.emit('client-error', full);
    } catch (_) {}
  }
  try {
    fetch(`${getApiBase()}/api/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}

/**
 * Show a full-screen recovery overlay using pure DOM. Works even when React is broken.
 * Gives the user a "Refresh page" button so they never need to kill the tab or restart the machine.
 */
function showGlobalCrashOverlay() {
  if (crashOverlayShown || typeof document === 'undefined') return;
  crashOverlayShown = true;
  try {
    const overlay = document.createElement('div');
    overlay.id = 'tichu-global-crash-overlay';
    overlay.setAttribute('role', 'alert');
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:999999;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;',
      'background:rgba(0,0,0,0.92);color:#fff;font-family:system-ui,sans-serif;padding:2rem;text-align:center;',
      'box-sizing:border-box;',
    ].join('');
    overlay.innerHTML = [
      '<h2 style="margin:0;font-size:1.25rem;">Something went wrong</h2>',
      '<p style="margin:0;max-width:360px;opacity:0.9;">The game hit an error. Refresh the page to recover — you don\'t need to close the tab or restart.</p>',
      '<div style="display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;">',
      '<button type="button" id="tichu-crash-refresh" style="padding:0.6rem 1.2rem;cursor:pointer;font-size:1rem;border-radius:6px;border:none;background:#4a9;color:#fff;">Refresh page</button>',
      '<button type="button" id="tichu-crash-dismiss" style="padding:0.6rem 1.2rem;cursor:pointer;font-size:1rem;border-radius:6px;border:1px solid #666;background:transparent;color:#ccc;">Dismiss</button>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);
    overlay.querySelector('#tichu-crash-refresh').onclick = () => { window.location.reload(); };
    overlay.querySelector('#tichu-crash-dismiss').onclick = () => {
      overlay.remove();
      crashOverlayShown = false;
    };
  } catch (_) {
    crashOverlayShown = false;
  }
}

function initClientErrorReport(socket) {
  if (socketRef) return;
  socketRef = socket;

  window.onerror = function (message, source, lineno, colno, error) {
    sendToServer({
      source: 'window.onerror',
      message: typeof message === 'string' ? message : String(message),
      stack: error?.stack,
      location: source ? `${source}:${lineno}:${colno}` : undefined,
    });
    showGlobalCrashOverlay();
    return true;
  };

  window.onunhandledrejection = function (event) {
    const reason = event?.reason;
    sendToServer({
      source: 'unhandledrejection',
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
    });
    showGlobalCrashOverlay();
  };
}

function reportClientError(payload) {
  sendToServer(payload);
}

export { initClientErrorReport, reportClientError, showGlobalCrashOverlay };
