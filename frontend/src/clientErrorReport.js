/**
 * Sends client errors to the server terminal (socket when connected, fetch POST as fallback).
 * Used by GameErrorBoundary, HandErrorBoundary, and global handlers (window.onerror, unhandledrejection).
 * Check the backend terminal for client error logs.
 */
let socketRef = null;

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
    return false;
  };

  window.onunhandledrejection = function (event) {
    const reason = event?.reason;
    sendToServer({
      source: 'unhandledrejection',
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
    });
  };
}

function reportClientError(payload) {
  sendToServer(payload);
}

export { initClientErrorReport, reportClientError };
