# Tichu

A real-time web implementation of the 4-player partnership card game **Tichu**.

This repository contains:
- a React + Vite frontend
- a Node.js + Express + Socket.IO backend
- automated tests for game logic and UI token/layout behavior

## Features

- Real-time multiplayer game rooms via Socket.IO
- Full Tichu flow:
  - Grand Tichu declaration
  - card exchange
  - trick-taking play with special cards (Mah Jong, Dog, Phoenix, Dragon)
- Team scoring with Tichu/Grand Tichu call outcomes
- In-game sidebar (chat, players, log/theme panels)
- Responsive board/dock/sidebar layout improvements
- Quick local test-game utilities from the landing page

## Tech Stack

- **Frontend:** React 18, Vite, Vitest
- **Backend:** Node.js, Express, Socket.IO, Jest
- **Deployment:** Vercel (frontend) + Render (backend)

## Repository Structure

```text
Tichu/
├── backend/
│   ├── game/                  # Core game/scoring/validation logic
│   ├── tests/                 # Backend unit/integration tests
│   ├── server.js              # Express + Socket.IO server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── styles/
│   │   └── socket.js
│   └── package.json
├── docs/
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
- sequencials
- full houses
- straights
- bombs (four-of-a-kind, straight flush)

Scoring includes:
- card points (5/10/K, Dragon +25, Phoenix -25)
- Tichu (+/-100)
- Grand Tichu (+/-200)

## Notes

- For current known issues and future ideas, see `docs/FUTURE.md`.
- For stability and debugging notes, see `docs/FRONTEND_BACKEND_STABILITY_NOTES.md`.
