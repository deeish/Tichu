# Deploy Tichu: Vercel (frontend) + Render (backend)

**Dashboard links (don’t lose these):**
- **Frontend (Vercel):** https://vercel.com/deeishs-projects/tichu
- **Backend (Render):** https://dashboard.render.com/web/srv-d6gf1o8gjchc73c3ruc0

**Live backend URL** (use this in Vercel’s `VITE_SOCKET_URL`): `https://tichu-ba5d.onrender.com`

This guide assumes your code is in a **GitHub** repo. If not, create a repo and push first.

---

## 1. Deploy backend on Render

1. Go to [render.com](https://render.com) and sign in (GitHub is easiest).
2. Click **New → Web Service**.
3. Connect your GitHub account if needed, then select the **Tichu** repository.
4. Configure:
   - **Name:** e.g. `tichu-backend` (your URL will be `https://tichu-backend.onrender.com`).
   - **Region:** pick one (e.g. Oregon).
   - **Root Directory:** set to `backend` (important).
   - **Runtime:** Node.
   - **Build Command:** `npm install` (or leave default).
   - **Start Command:** `npm start`.
5. Click **Create Web Service**. Render will build and deploy. Wait until the service shows **Live**.
6. Copy your service URL (e.g. `https://tichu-backend.onrender.com`). You need it for the frontend.

7. (Optional) In the Render service **Settings → Health Checks**, set the path to **`/health`** so deploys use the lightweight probe defined in `backend/server.js`.

8. (Optional) Socket.IO keepalive tuning — only if you see flaky disconnects: set **`SOCKET_IO_PING_TIMEOUT_MS`** (default `45000`) and/or **`SOCKET_IO_PING_INTERVAL_MS`** (default `25000`) in Render **Environment**. See `docs/SERVER_HARDENING_PLAN.md` §P5.

9. (Optional) HTTP request-phase timeouts on the Node server (slow clients on **`/health`** or **`/api/client-error`**): **`HTTP_REQUEST_TIMEOUT_MS`** (default `30000`) and **`HTTP_HEADERS_TIMEOUT_MS`** (default request + 5s, must stay **greater** than request). See `docs/SERVER_HARDENING_PLAN.md` §P2b.

10. (Optional) **Resume games after a backend restart** — provision **Redis** (e.g. [Upstash](https://upstash.com/) or Render Redis), then set **`REDIS_URL`** on the Render service to the connection string (`rediss://…` / `redis://…`). The server snapshots party state periodically and reloads it on boot; every player still shows as disconnected until they **rejoin** with their stored token. **`GET /health`** includes **`persistRedis: true`** when Redis is connected. See `docs/SERVER_HARDENING_PLAN.md` §P4. Optional **`GAME_REDIS_SAVE_DEBOUNCE_MS`** (default `400`) throttles writes.

**Note:** On the **free** tier, the service sleeps after ~15 minutes of no traffic; the first request after that may take 30–60 seconds. **This project uses Render’s paid Starter** web service, which does not spin down from idle that way. Deploys and platform restarts still recycle the Node process — without **`REDIS_URL`**, in-memory games are lost; with it, parties can reload and players can rejoin.

---

## 2. Deploy frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. Click **Add New → Project** and import your **Tichu** repository.
3. Configure:
   - **Root Directory:** click **Edit**, set to `frontend`, then **Continue**.
   - **Framework Preset:** Vite (should be auto-detected).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** `dist` (default for Vite).
   - **Environment Variables:** click **Add** and add:
     - **Name:** `VITE_SOCKET_URL`
     - **Value:** your Render backend URL from step 1, e.g. `https://tichu-backend.onrender.com`  
     (No trailing slash.)
4. Click **Deploy**. Wait for the build to finish.
5. Open the generated URL (e.g. `https://tichu-xxx.vercel.app`). The app should load and connect to the backend.

---

## 3. (Optional) Restrict CORS on the backend

For security, you can limit the backend to only accept requests from your frontend:

1. In **Render**, open your web service → **Environment**.
2. Add a variable **`FRONTEND_ORIGIN`** = `https://your-app.vercel.app` (your Vercel URL, no path).
3. **No code change needed:** `backend/server.js` already uses `process.env.FRONTEND_ORIGIN || "*"` for Express CORS and Socket.IO.
4. Save env; Render will redeploy automatically (or trigger a manual deploy).

---

## 4. Quick reference

| What              | Where to set / look |
|-------------------|----------------------|
| Backend URL       | Render dashboard → your service → URL at top |
| Frontend env var  | Vercel → Project → Settings → Environment Variables → `VITE_SOCKET_URL` |
| Game snapshots (optional) | Render → **`REDIS_URL`** (Redis / Upstash connection string) |
| Re-deploy         | Push to GitHub; both Vercel and Render will rebuild automatically (if auto-deploy is on). |

---

## Local development after deployment

- **Frontend:** `cd frontend && npm run dev` — uses `http://localhost:3001` if `VITE_SOCKET_URL` is not set (see `frontend/.env.example`).
- **Backend:** `cd backend && npm run dev` — runs on port 3001. Frontend proxy in `vite.config.js` sends `/socket.io` to it.

You can point local frontend at the deployed backend by creating `frontend/.env` with `VITE_SOCKET_URL=https://your-backend.onrender.com`.
