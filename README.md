# Artemis II Mission Tracker

A full-stack mission dashboard for Artemis II with a static multi-page frontend, a Node.js/Express API backend, live telemetry polling, WebSocket push updates, automated mission/news aggregation, and a separate hidden admin console for manually managing media assets.

This repository is organized as two applications:

- `frontend/` contains the public website and the hidden admin page.
- `backend/` contains the REST API, scheduled data collection jobs, media persistence, and WebSocket server.

The project is designed to present a "mission control" style experience around Artemis II. It combines live or near-live orbital data, mission timeline snapshots, Deep Space Network information, space weather, and curated media into one interface.

## Table of Contents

- [What This Project Does](#what-this-project-does)
- [Main Features](#main-features)
- [Architecture Overview](#architecture-overview)
- [Repository Structure](#repository-structure)
- [Tech Stack](#tech-stack)
- [How Data Flows](#how-data-flows)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Public Pages](#public-pages)
- [Backend API](#backend-api)
- [WebSocket Feed](#websocket-feed)
- [Media Admin Workflow](#media-admin-workflow)
- [Manual Media Posting Rules](#manual-media-posting-rules)
- [Useful Scripts](#useful-scripts)
- [Deployment Notes](#deployment-notes)
- [Security Notes](#security-notes)
- [Known Limitations and Legacy Files](#known-limitations-and-legacy-files)
- [Troubleshooting](#troubleshooting)

## What This Project Does

The Artemis II Mission Tracker is a mission dashboard focused on the Artemis II flight profile and supporting context around the mission.

At runtime, it provides:

- live or fallback orbital telemetry
- mission elapsed time and mission phase tracking
- mission timeline and activity updates
- Deep Space Network visibility
- space weather summaries and event lists
- Artemis-related news aggregation from RSS and timeline highlights
- a public media center for images, videos, documents, and other files
- a hidden standalone admin console for authorized media publishing

The frontend is intentionally simple to host: it is a static site made from HTML, CSS, and plain JavaScript. The backend handles the dynamic work and persistence.

## Main Features

- Real-time dashboard with telemetry cards, mission timing, and timeline rendering
- WebSocket broadcasting for telemetry, DSN, weather, and timeline refreshes
- REST API for telemetry, history, news, timeline, weather, health, DSN, and media
- MongoDB-backed snapshot storage for telemetry, timeline, weather, DSN, news, and media
- In-memory caching layer to reduce repeated upstream fetches
- Automatic news aggregation from multiple Artemis-related feeds
- Automatic timeline/news/weather refresh via cron jobs
- Public media center with grouped content:
  - images
  - videos
  - documents
  - other downloadable files
- Manual admin posting for:
  - Google Drive images
  - Google Drive videos
  - YouTube links
  - direct `.mp4`, `.webm`, `.ogg`, `.mov`, `.m4v` links
  - uploaded local image/video/document/other files
  - PDFs, docs, spreadsheets, text files, JSON, XML, and similar assets
- Hidden admin access flow:
  - not linked from the public UI
  - separate page from the public media center
  - temporary unlock via private keyboard shortcut
  - login-backed posting session using `ADMIN_API_KEY`

## Architecture Overview

```text
frontend/src/*.html + frontend/src/js/*
        |
        |  fetch / WebSocket
        v
backend/src/app.js
        |
        +--> REST routes (/api/v1/*)
        +--> WebSocket server (/ws)
        +--> cron scheduler
        |
        +--> services
              |
              +--> cache (in-memory)
              +--> MongoDB via Mongoose
              +--> external data sources
                    - AROW community relay
                    - JPL Horizons fallback
                    - NASA DONKI
                    - RSS feeds
```

### High-level runtime design

1. The frontend loads static HTML/JS/CSS from `frontend/src`.
2. The frontend calls the backend REST API for initial data.
3. The frontend connects to `/ws` for push updates.
4. The backend runs scheduled jobs to refresh telemetry, DSN, timeline, weather, and news.
5. Fresh data is cached, optionally persisted to MongoDB, and broadcast to connected clients.
6. The media center reads manually managed media from MongoDB plus bundled fallback content if the media collection is empty.

## Repository Structure

```text
ARTEMIS-TRACKER/
|- frontend/
|  `- src/
|     |- index.html
|     |- about.html
|     |- crew.html
|     |- crew-schedule.html
|     |- spacecraft.html
|     |- media.html
|     |- sources.html
|     |- admin.html
|     |- css/style.css
|     |- js/app.js
|     |- js/media.js
|     |- js/admin-access.js
|     |- js/admin-console.js
|     `- js/data.js
|
`- backend/
   |- src/
   |  |- index.js
   |  |- app.js
   |  |- config/
   |  |- routes/
   |  |- services/
   |  |- fetchers/
   |  |- websocket/
   |  |- cache/
   |  |- db/
   |  |  |- models/
   |  |  `- queries/
   |  `- utils/
   |- scripts/
   |- package.json
   `- .env.example
```

## Tech Stack

### Frontend

- HTML5
- CSS
- Vanilla JavaScript
- WebSocket client
- Static multi-page structure

### Backend

- Node.js 22+
- Express 5
- Mongoose
- MongoDB
- `ws` for WebSockets
- `node-cron` for scheduled refresh
- `helmet`, `cors`, `morgan`
- `undici` for HTTP calls

### Data and storage

- MongoDB for persisted snapshots and media metadata
- local filesystem storage under `backend/public/media` for uploaded files
- in-memory cache for fast transient reads

## How Data Flows

### Telemetry

Telemetry is fetched through a fallback chain:

1. AROW community consolidated endpoint
2. direct community telemetry + AROW system endpoints
3. JPL Horizons fallback
4. interpolated mock telemetry

Real data snapshots are stored in MongoDB. Mock data is cached but intentionally not written to the database.

### Timeline

Timeline data is pulled from the community mission timeline feed, cached, stored in MongoDB, and broadcast to clients every 5 minutes.

### Space weather

Space weather combines:

- live solar data from the community relay when available
- NASA DONKI event feeds for solar flares, CMEs, geomagnetic storms, and SEP events

### News

News is automatically fetched from:

- NASA Artemis RSS
- Spaceflight Now
- NASASpaceflight
- Ars Technica science feed
- mission timeline highlights from the community timeline API

Important: news is still automated. It is not manually posted through the admin console.

### Media

Media content is different from news:

- public viewers consume `GET /api/v1/media`
- admins can create new items through the hidden admin console
- URL-based items are saved as metadata in MongoDB
- uploaded files are stored under `backend/public/media/...` and then referenced by MongoDB records

## Local Development Setup

### Prerequisites

Make sure you have:

- Node.js 22 or newer
- npm
- a MongoDB connection string
- optionally a NASA API key
- a static file server for the frontend, or a hosting platform that can serve `frontend/src`

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd ARTEMIS-TRACKER
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

There is no frontend `package.json` in this repo. The frontend is static and does not need an install step.

### 3. Create backend environment variables

Copy `backend/.env.example` to `backend/.env` and fill in the values:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4. Start the backend

From `backend/`:

```bash
npm run dev
```

or:

```bash
npm start
```

The backend defaults to `http://localhost:3001`.

### 5. Serve the frontend statically

Because the frontend is plain static files, you can use any static server. Common options:

- VS Code Live Server
- `python -m http.server`
- `npx serve frontend/src`
- Nginx / Apache / Vercel / Netlify

Example with Python from the repo root:

```bash
cd frontend/src
python -m http.server 3000
```

Then open:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:3001`

The frontend JavaScript already assumes:

- `http://localhost:3001` when running on localhost
- `https://artemis-tracker-mzav.onrender.com` when not on localhost

If you use a different backend URL in development or production, update the hard-coded `BACKEND_BASE` values in:

- `frontend/src/js/app.js`
- `frontend/src/js/media.js`
- `frontend/src/js/admin-console.js`

## Environment Variables

The backend reads configuration from `backend/.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Environment name, usually `development` or `production`. |
| `PORT` | No | Backend port. Defaults to `3001`. |
| `LOG_LEVEL` | No | Logging level for backend logs. |
| `MONGODB_URI` | Yes | MongoDB connection string used by Mongoose. |
| `NASA_API_KEY` | Recommended | NASA API key for NASA-backed fetchers. |
| `COMMUNITY_API_BASE` | No | Base URL for community Artemis relay endpoints. |
| `COMMUNITY_API_TIMEOUT_MS` | No | Timeout for community API calls. |
| `ADMIN_API_KEY` | Yes | Admin password used to sign in to the hidden media console. |
| `ALLOWED_ORIGINS` | Yes for production | Comma-separated frontend origins allowed by CORS. |

Example:

```env
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?appName=<app_name>
NASA_API_KEY=YOUR_NASA_API_KEY
COMMUNITY_API_BASE=https://artemis.cdnspace.ca
COMMUNITY_API_TIMEOUT_MS=30000
ADMIN_API_KEY=replace_this_with_a_real_secret
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
```

## Running the Project

### Backend development

```bash
cd backend
npm run dev
```

### Backend production

```bash
cd backend
npm start
```

### Frontend

Serve `frontend/src` as a static site and make sure the origin is listed in `ALLOWED_ORIGINS`.

## Public Pages

The public frontend includes these pages:

- `index.html` - main mission dashboard
- `about.html` - project/about page
- `crew.html` - crew overview
- `crew-schedule.html` - crew schedule view
- `spacecraft.html` - Orion / SLS / subsystem overview
- `media.html` - public media center
- `sources.html` - mission/data sources page

The admin page is separate:

- `admin.html` - hidden admin console, not linked from the public UI

Public pages include the hidden admin shortcut script, but they do not expose any visible admin login UI.

## Backend API

Base path: `/api/v1`

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns overall backend health and MongoDB status. |

### Telemetry

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/telemetry` | Returns current telemetry snapshot. |
| `GET` | `/telemetry/history?hours=2` | Returns telemetry history for the requested window. |

### Timeline

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/timeline/current` | Returns current mission timeline snapshot. |

### DSN

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/dsn` | Returns current Deep Space Network data. |

### Space weather

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/weather` | Returns current space weather summary and event lists. |

### News

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/news` | Returns latest Artemis-related news items. |
| `GET` | `/news?limit=6` | Returns a limited number of items. |

### Media

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/media` | Returns the public media hub payload. |
| `POST` | `/media/admin/login` | Signs in an admin and returns a temporary admin session token. |
| `GET` | `/media/admin/session` | Validates the current admin session token. |
| `POST` | `/media` | Creates a media item. Requires `x-admin-token`. |

### Example media response

```json
{
  "items": [],
  "images": [],
  "videos": [],
  "documents": [],
  "others": [],
  "importantLinks": [],
  "supportedTypes": ["image", "video", "document", "other"],
  "maxUploadSizeBytes": 26214400,
  "usingFallbackMedia": false,
  "generatedAt": "2026-04-09T12:00:00.000Z"
}
```

## WebSocket Feed

The backend upgrades connections on:

```text
/ws
```

The server broadcasts channel-based messages with this shape:

```json
{
  "type": "telemetry",
  "data": {},
  "timestamp": 1710000000000
}
```

Currently the frontend uses WebSocket updates for:

- `telemetry`
- `weather`
- `dsn`
- `timeline`

The server also sends initial state immediately after connection.

## Media Admin Workflow

The admin console is intentionally separated from the public media center.

### What public viewers see

- `media.html` shows only public media content
- no admin button
- no visible login box
- no public link to the admin page

### How admin access works

1. Open any public page.
2. Use the hidden shortcut:
   - press `Ctrl + Alt + Shift + A`
   - or type `artemisadmin` while not focused in an input
3. The browser is redirected to `admin.html`.
4. The shortcut grants a short-lived unlock token in session storage.
5. Only after that unlock is present does the login form appear.
6. Log in using `ADMIN_API_KEY`.
7. The backend returns a signed admin session token.
8. Media posting uses `x-admin-token` for protected API requests.

### Session behavior

- shortcut unlock lifetime: about 2 minutes
- admin session lifetime: about 8 hours
- sessions are stored in browser `sessionStorage`
- closing the browser tab clears the session storage state for that tab

### Why this design exists

This design keeps the admin UI out of the public browsing flow while still allowing an internal manual publishing workflow.

Important: the hidden shortcut is not the real security boundary. The actual protection is the backend session validation tied to `ADMIN_API_KEY`.

## Manual Media Posting Rules

The media system supports both URL submissions and file uploads.

### Supported media types

- `image`
- `video`
- `document`
- `other`

### Supported URL patterns

You can post:

- Google Drive image links
- Google Drive video links
- YouTube links
- direct video links such as `.mp4`, `.webm`, `.ogg`, `.mov`, `.m4v`
- direct document or file links
- backend-hosted `/public/...` file URLs

### Supported uploads

Images:

- `.jpg`
- `.jpeg`
- `.png`
- `.gif`
- `.webp`
- `.svg`
- `.avif`

Videos:

- `.mp4`
- `.webm`
- `.ogg`
- `.mov`
- `.m4v`

Documents:

- `.pdf`
- `.doc`
- `.docx`
- `.txt`
- `.md`
- `.rtf`
- `.csv`
- `.json`
- `.xml`
- `.ppt`
- `.pptx`
- `.xls`
- `.xlsx`

Other:

- any file that does not fit the image/video/document detection rules

### Upload size limit

- maximum upload size: `25 MB`

### URL-based example payload

```json
{
  "title": "Crew Photo",
  "type": "image",
  "category": "crew",
  "description": "Official crew image from Google Drive.",
  "url": "https://drive.google.com/file/d/FILE_ID/view"
}
```

### Upload-based example payload

```json
{
  "title": "Press Kit PDF",
  "type": "document",
  "category": "press",
  "description": "Launch press kit.",
  "upload": {
    "fileName": "press-kit.pdf",
    "mimeType": "application/pdf",
    "dataBase64": "<base64 data>"
  }
}
```

### Where uploaded files are stored

Uploaded files are written under:

- `backend/public/media/images`
- `backend/public/media/videos`
- `backend/public/media/documents`
- `backend/public/media/others`

The backend serves these files from:

```text
/public
```

So a saved file may be referenced like:

```text
/public/media/documents/1710000000000-file.pdf
```

## Useful Scripts

All scripts below run from `backend/`.

### Seed starter media

```bash
node scripts/seed_media.js
```

What it does:

- connects to MongoDB
- deletes all current media items
- inserts a starter set of items

### Add a single remote media item quickly

```bash
node scripts/add_drive_media.js "Crew Photo" "image" "https://drive.google.com/file/d/FILE_ID/view" "Official crew image"
```

Supported type values:

- `image`
- `video`
- `document`
- `other`

### Move old local media into backend public folders

```bash
node scripts/move_media.js
```

This script looks for old top-level `images/` and `videos/` folders and moves files into `backend/public/media/...`.

## Deployment Notes

### Backend

For deployment, the backend needs:

- Node.js 22+
- access to MongoDB
- a valid `ADMIN_API_KEY`
- the frontend origin added to `ALLOWED_ORIGINS`
- persistent storage if you want uploaded media files to survive restarts

Important for uploads:

- if your host has ephemeral disk storage, uploaded files may disappear on redeploy/restart
- in that case, move media storage to persistent disk or object storage

### Frontend

The frontend can be deployed to any static host.

Before production deployment, verify:

- the backend URL in frontend JS points to your real API host
- the backend CORS config includes your frontend domain
- `/public/media/...` files are reachable from the deployed backend

## Security Notes

- Change `ADMIN_API_KEY` immediately for production.
- Do not leave `ADMIN_API_KEY=change_me_in_production`.
- Treat the keyboard shortcut only as UI concealment, not true security.
- The hidden admin phrase `artemisadmin` is embedded in `frontend/src/js/admin-access.js`. Change it before public deployment if you continue using this approach.
- The admin page includes `noindex,nofollow,noarchive`, but that does not replace authentication.
- Session tokens are HMAC-signed with `ADMIN_API_KEY`, so rotating the admin key invalidates old sessions.

## Known Limitations and Legacy Files

This repo is functional, but it still contains some older artifacts that are worth knowing about.

### 1. Frontend backend URL is hard-coded

The frontend decides between:

- `http://localhost:3001`
- `https://artemis-tracker-mzav.onrender.com`

There is no frontend environment-variable system in this repo right now.

### 2. Notification code references a missing service worker

`frontend/src/js/app.js` contains notification logic that tries to register `/sw.js`, but a matching `sw.js` file is not currently present in `frontend/src`.

That means notification-related behavior is incomplete until a service worker is added.

### 3. PostgreSQL files remain, but current runtime uses MongoDB

The active application startup connects to MongoDB through Mongoose.

Legacy PostgreSQL-related files still exist, including:

- `backend/src/db/pool.js`
- `backend/src/db/migrations/`
- the `pg` dependency in `backend/package.json`

These are currently not the primary runtime persistence path.

### 4. Hidden admin access is still a lightweight approach

The current admin solution is intentionally simple:

- shortcut unlock on the frontend
- password-based admin login
- signed session token

If you need stronger production security, consider moving to a full user/auth system with real roles, IP restrictions, audit logging, or SSO.

### 5. Uploaded media lives on local server disk

This is simple and works locally, but many cloud platforms use ephemeral filesystems.

For stronger production durability, use persistent volume storage or cloud object storage.

## Troubleshooting

### Backend starts but frontend shows no live data

Check:

- backend is running on `localhost:3001`
- frontend is being served from a real local server, not blocked by browser file-origin rules
- browser console for CORS or fetch errors
- `ALLOWED_ORIGINS` includes your frontend origin in production

### Media page loads fallback items only

Possible reasons:

- MongoDB is not connected
- media collection is empty
- database query failed and fallback media was used

### Admin page stays locked

Check:

- you used the shortcut on a public page first
- the redirect to `admin.html` happened in the same browser tab
- session storage is enabled
- the 2-minute shortcut unlock did not expire

### Admin login works but uploads fail

Check:

- backend is running
- `x-admin-token` session is still valid
- upload is under 25 MB
- uploaded file type matches the selected media type
- the backend process can write to `backend/public/media/...`

### Media uploads work locally but disappear after deployment

Your hosting platform may be using ephemeral disk storage. Move uploads to persistent storage.

### News is not editable from admin

That is expected in the current design. News continues to be fetched automatically from timeline and RSS sources.

---

If you want to extend this project next, the most natural follow-up improvements are:

- replace the hidden shortcut with a proper auth system
- move uploaded media to cloud storage
- add frontend configuration for backend URL
- add tests for media posting and admin session behavior
- add a real service worker if browser notifications are required
