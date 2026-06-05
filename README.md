# Tichu

A real-time web implementation of the 4-player partnership card game **Tichu**.

This repository contains:
- a React + Vite frontend
- a Node.js + Express + Socket.IO backend
- automated tests for game logic and UI token/layout behavior

## Features

- Real-time multiplayer game rooms via Socket.IO
- **Mobile and desktop friendly** — responsive layout, touch support, and iOS WebSocket handling
- Full Tichu flow:
  - Grand Tichu declaration
  - card exchange
  - trick-taking play with special cards (Mah Jong, Dog, Phoenix, Dragon)
- Team scoring with Tichu/Grand Tichu call outcomes
- End-game stats popup (special cards played, bombs, Tichu/Grand Tichu outcomes)
- In-game sidebar (chat, players, log/theme panels)
- "How to Play" rules page at `/how-to-play`
- Lobby features: player name editing, team randomization, custom starting scores
- Invite/share links via `?join=` URL parameter
- Reconnect/rejoin system with token-based recovery and exponential backoff
- Quick local test-game utilities from the landing page
- Landing page changelog strip

## Tech Stack

- **Frontend:** React 18, React Router DOM, Vite, Vitest
- **Backend:** Node.js, Express, Socket.IO, Jest
- **Persistence:** Redis (optional — game-state snapshots for reconnect recovery)
- **Deployment:** Vercel (frontend) + Render (backend)

## Repository Structure

```text
Tichu/
├── backend/
│   ├── config/                # Game constants (gameRules.js)
│   ├── game/                  # Core game/scoring/validation logic
│   ├── server/                # Socket handlers, game manager, persistence
│   ├── tests/                 # Backend unit/integration tests
│   ├── server.js              # Express + Socket.IO entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React UI components
│   │   ├── data/              # Landing page changelog data
│   │   ├── styles/            # CSS + layout tokens
│   │   ├── utils/             # Card utils, state normalization, touch utils
│   │   └── socket.js          # Socket.IO client init
│   └── package.json
├── docs/
│   ├── BUGS.md
│   ├── DEPLOY.md
│   ├── FRONTEND_BACKEND_STABILITY_NOTES.md
│   └── FUTURE.md
└── README.md
```

## Local Development

### Prerequisites

- Node.js 18+ (recommended)
- npm

### 1) Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Start backend

```bash
cd backend
npm run dev
```

Default backend URL: `http://localhost:3001`

### 3) Start frontend

```bash
cd frontend
npm run dev
```

Default frontend URL: `http://localhost:5173`

If `VITE_SOCKET_URL` is not set, frontend uses `http://localhost:3001`.
You can also set `frontend/.env`:

```env
VITE_SOCKET_URL=http://localhost:3001
```

## Scripts

### Backend (`backend/package.json`)

- `npm start` - run production server
- `npm run dev` - run with nodemon
- `npm test` - run Jest tests
- `npm run test:watch` - Jest watch mode
- `npm run test:coverage` - coverage report
- `npm run test:bots` - bot test runner

### Frontend (`frontend/package.json`)

- `npm start` / `npm run dev` - Vite dev server
- `npm run build` - production build
- `npm run preview` - preview built app
- `npm test` - run Vitest once
- `npm run test:watch` - Vitest watch mode

## Testing

Run all backend tests:

```bash
cd backend
npm test
```

Run all frontend tests:

```bash
cd frontend
npm test
```

## Deployment

See `docs/DEPLOY.md` for full setup and environment instructions.
For public/open-source usage, create your own Vercel/Render projects and configure
environment variables as described there.

## Gameplay Summary

Tichu is a 4-player, 2-team trick-taking game to 1000 points using a 56-card deck
(standard 52 + Mah Jong, Dog, Phoenix, Dragon).

Supported combination types include:
- singles
- pairs
- triples
- sequences
- full houses
- straights
- bombs (four-of-a-kind, straight flush)

Scoring includes:
- card points (5/10/K, Dragon +25, Phoenix -25)
- Tichu (+/-100)
- Grand Tichu (+/-200)

## Notes

- For current known issues, see `docs/BUGS.md`.
- For future ideas and roadmap, see `docs/FUTURE.md`.
- For stability and debugging notes, see `docs/FRONTEND_BACKEND_STABILITY_NOTES.md`.
