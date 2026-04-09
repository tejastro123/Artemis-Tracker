# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

- **Install backend dependencies**
  ```bash
  cd backend
  npm install
  ```
- **Run backend in development (nodemon)**
  ```bash
  npm run dev
  ```
- **Run backend in production mode**
  ```bash
  npm start
  ```
- **Run backend test suite**
  ```bash
  npm test
  ```
- **Run a single Jest test** (replace `<pattern>` with a test name or file glob)
  ```bash
  npx jest -t "<pattern>"
  ```
- **Serve the static frontend** (any static server, e.g. Python, `serve`, or VS Code Live Server)
  ```bash
  cd frontend/src
  python -m http.server 3000
  ```
- **Run data‑collection scripts** (located in `backend/scripts`)
  ```bash
  node scripts/seed_media.js
  node scripts/add_drive_media.js "Title" "type" "url" "description"
  node scripts/move_media.js
  ```

## High‑Level Architecture

- **Frontend** (`frontend/src`)
  - Plain‑HTML/CSS/vanilla JS, served statically.
  - Connects to the backend via HTTP REST (`/api/v1/*`) and a WebSocket at `/ws` for push updates.
  - Hard‑coded backend base URLs are `http://localhost:3001` (dev) and `https://artemis-tracker-mzav.onrender.com` (prod). Update these in `frontend/src/js/app.js`, `media.js`, and `admin-console.js` when deploying elsewhere.
  - Hidden admin console (`admin.html`) is unlocked via a secret keyboard shortcut (`Ctrl+Alt+Shift+A` or typing `artemisadmin`).

- **Backend** (`backend/src`)
  - Node.js 22+, Express 5, Mongoose (MongoDB) for persistence.
  - **Entry point**: `src/index.js` → `src/app.js` sets up middleware, routes, WebSocket server, and scheduled jobs.
  - **Routes** (`src/routes`): telemetry, weather, DSN, news, timeline, media, health.
  - **Services** (`src/services`): encapsulate external data fetchers (NASA DONKI, community APIs, JPL Horizons, RSS) and business logic.
  - **Cache** (`src/cache/CacheManager.js`): in‑memory cache to avoid repeated external calls.
  - **WebSocket server** (`src/websocket/WSServer.js`) broadcasts channel messages (`telemetry`, `weather`, `dsn`, `timeline`).
  - **Cron jobs** (`node-cron`) periodically refresh telemetry, weather, DSN, news, and timeline.
  - **Admin workflow**: admin logs in via `POST /media/admin/login` using `ADMIN_API_KEY`. A signed admin token (`x-admin-token`) protects media POST endpoints.
  - **Media storage**: uploaded files saved under `backend/public/media/*`; metadata stored in MongoDB. Public media endpoint (`GET /media`) serves aggregated payload.
  - **Legacy artifacts**: PostgreSQL pool and migration files exist but are not used; MongoDB is the active data store.

## Important Notes for Claude Code

- The repo does **not** have a frontend build system; the frontend is static.
- Linting and type‑checking are not configured; rely on runtime tests (`npm test`).
- Security‑relevant secret is `ADMIN_API_KEY`; it must be set in `.env` for any admin actions.
- When adding new routes or services, follow the pattern of existing files: export a function that receives dependencies and returns an Express router.
- For any new environment‑specific values, add them to `backend/.env.example` and document them here.
- Keep the hidden admin shortcut (`artemisadmin`) and its usage in sync with `frontend/src/js/admin-access.js` if the shortcut is changed.
