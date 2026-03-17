/**
 * Web Worker: parses a JSON game state string and posts back the object.
 * Clone (parse) runs off the main thread so the UI stays responsive.
 * Main thread sends normalizeGameState() output as JSON string; we parse and post back.
 * requestId is echoed so the main thread can ignore stale responses.
 */
self.onmessage = (e) => {
  const { type, json, requestId } = e.data || {};
  if (type !== 'clone' || typeof json !== 'string') return;
  try {
    const game = JSON.parse(json);
    self.postMessage({ type: 'result', game, requestId });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || 'parse failed', requestId });
  }
};
