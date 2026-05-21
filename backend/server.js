/**
 * Main server file
 * Sets up Express and Socket.io server
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const {
  setupSocketHandlers,
  setGameplayPersistence,
  syncStateVersionCountersFromGames,
} = require('./server/socketHandlers');
const { createGameplayPersistence } = require('./server/gamePersistence');
const { createFixedWindowRateLimiter } = require('./server/simpleRateLimiter');

const corsOrigin = process.env.FRONTEND_ORIGIN || '*';

const games = new Map();
const players = new Map();

/** Longer default helps mobile / background tabs / flaky NAT; override via env if needed. */
function envPositiveMs(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const persistence = createGameplayPersistence(process.env.REDIS_URL);
  await persistence.init();
  await persistence.restoreIntoMap(games);
  if (games.size > 0) {
    syncStateVersionCountersFromGames(games);
    console.log(`[persist] restored ${games.size} game(s) from Redis — clients should use Rejoin`);
  }
  setGameplayPersistence(persistence);

  const socketPingTimeout = envPositiveMs('SOCKET_IO_PING_TIMEOUT_MS', 20_000);
  const socketPingInterval = envPositiveMs('SOCKET_IO_PING_INTERVAL_MS', 10_000);

  const app = express();
  const server = http.createServer(app);
  app.set('trust proxy', 1);

  /** P2b: bound slow HTTP phases (slow-loris / stalled body) without touching long-lived Socket.IO traffic after upgrade. */
  const httpRequestTimeoutMs = envPositiveMs('HTTP_REQUEST_TIMEOUT_MS', 30_000);
  let httpHeadersTimeoutMs = envPositiveMs('HTTP_HEADERS_TIMEOUT_MS', httpRequestTimeoutMs + 5_000);
  if (httpHeadersTimeoutMs <= httpRequestTimeoutMs) {
    httpHeadersTimeoutMs = httpRequestTimeoutMs + 5_000;
  }
  server.requestTimeout = httpRequestTimeoutMs;
  server.headersTimeout = httpHeadersTimeoutMs;

  const io = socketIo(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
    pingTimeout: socketPingTimeout,
    pingInterval: socketPingInterval,
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, persistRedis: persistence.isEnabled === true });
  });

  // Baseline browser hardening headers (safe defaults for SPA + API responses).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '48kb' }));

  const clientErrorLimiter = createFixedWindowRateLimiter({ windowMs: 60_000, max: 30, maxEntries: 20_000 });
  app.use('/api/client-error', (req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    if (!clientErrorLimiter.allow(`client-error:${ip}`)) {
      return res.status(429).json({ error: 'Too many client-error reports. Please retry later.' });
    }
    next();
  });

  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err?.stack || err?.message || err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });

  app.post('/api/client-error', (req, res) => {
    res.status(204).end();
    const payload = req.body || {};
    const src = payload.source ? ` [${payload.source}]` : '';
    console.error('\n********** CLIENT ERROR **********');
    console.error('[client-error]' + src, payload.message ?? payload);
    if (payload.socketId != null) console.error('Socket:', payload.socketId);
    if (payload.sentAt) console.error('Sent at:', payload.sentAt);
    if (payload.stack) console.error(String(payload.stack).slice(0, 4000));
    if (payload.componentStack) console.error('Component stack:', String(payload.componentStack).slice(0, 4000));
    if (payload.location) console.error('Location:', payload.location);
    if (payload.source === 'handValidation' && payload.invalidCards?.length) {
      console.error('Invalid cards:', JSON.stringify(payload.invalidCards, null, 2));
      console.error('Filtered count:', payload.filteredCount, '| Hand length before:', payload.handLengthBefore, '| Game state:', payload.gameState);
    }
    console.error('**********************************\n');
  });

  setupSocketHandlers(io, games, players);

  const PORT = process.env.PORT || 3001;

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, closing server…`);
    try {
      if (typeof io.disconnectSockets === 'function') {
        io.disconnectSockets(true);
      }
    } catch (err) {
      console.warn('[shutdown] disconnectSockets failed', err?.message ?? err);
    }
    server.close((err) => {
      if (err) console.error('[shutdown] server.close', err?.message ?? err);
      process.exit(err ? 1 : 0);
    });
    setTimeout(() => {
      console.error('[shutdown] timeout, forcing exit');
      process.exit(1);
    }, 12_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err?.stack || err?.message || err);
  process.exit(1);
});
