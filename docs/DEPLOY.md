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

**Note:** On the free tier, the service sleeps after ~15 minutes of no traffic. The first request after that may take 30–60 seconds to respond.

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
2. Add a variable, e.g. `FRONTEND_ORIGIN` = `https://your-app.vercel.app` (your Vercel URL).
3. In the repo, update `backend/server.js`: where you have `cors: { origin: "*" }`, change it to use `process.env.FRONTEND_ORIGIN || "*"` for the `origin` option.
4. Commit, push; Render will redeploy automatically.

---

## 4. Quick reference

| What              | Where to set / look |
|-------------------|----------------------|
| Backend URL       | Render dashboard → your service → URL at top |
| Frontend env var  | Vercel → Project → Settings → Environment Variables → `VITE_SOCKET_URL` |
| Re-deploy         | Push to GitHub; both Vercel and Render will rebuild automatically (if auto-deploy is on). |

---

## Local development after deployment

- **Frontend:** `cd frontend && npm run dev` — uses `http://localhost:3001` if `VITE_SOCKET_URL` is not set (see `frontend/.env.example`).
- **Backend:** `cd backend && npm run dev` — runs on port 3001. Frontend proxy in `vite.config.js` sends `/socket.io` to it.

You can point local frontend at the deployed backend by creating `frontend/.env` with `VITE_SOCKET_URL=https://your-backend.onrender.com`.
