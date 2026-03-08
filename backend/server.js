/**
 * Main server file
 * Sets up Express and Socket.io server
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { setupSocketHandlers } = require('./server/socketHandlers');

const corsOrigin = process.env.FRONTEND_ORIGIN || '*';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Client errors (from error boundaries, window.onerror, unhandledrejection) — logged in terminal
app.post('/api/client-error', (req, res) => {
  res.status(204).end();
  const payload = req.body || {};
  const src = payload.source ? ` [${payload.source}]` : '';
  console.error('\n********** CLIENT ERROR **********');
  console.error('[client-error]' + src, payload.message ?? payload);
  if (payload.socketId != null) console.error('Socket:', payload.socketId);
  if (payload.sentAt) console.error('Sent at:', payload.sentAt);
  if (payload.stack) console.error(payload.stack);
  if (payload.componentStack) console.error('Component stack:', payload.componentStack);
  if (payload.location) console.error('Location:', payload.location);
  if (payload.source === 'handValidation' && payload.invalidCards?.length) {
    console.error('Invalid cards:', JSON.stringify(payload.invalidCards, null, 2));
    console.error('Filtered count:', payload.filteredCount, '| Hand length before:', payload.handLengthBefore, '| Game state:', payload.gameState);
  }
  console.error('**********************************\n');
});

// Store active games
const games = new Map();
const players = new Map();

// Set up socket handlers
setupSocketHandlers(io, games, players);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
