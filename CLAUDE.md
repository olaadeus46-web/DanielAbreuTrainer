# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Daniel Abreu Trainer — a SaaS platform for personal training business management. Two user roles: **TRAINER** (manages clients, finances, automations) and **CLIENT** (views own metrics). Also has public pages (no login) for check-in, feedback, and online client intake forms.

The app is in Portuguese context (PT market) — error messages, DB seeds, and some comments are in Portuguese. The UI supports three languages: English, Portuguese, and German via i18next.

## Architecture

**Monorepo with two packages:**
- `frontend/` — React 18 SPA (Vite, react-router-dom v6, Zustand for state, Recharts for charts)
- `backend/` — Express API (ES modules, JWT auth, Supabase as database)

**Deployment:** Netlify. The backend runs as a Netlify Function via `serverless-http`. The build step bundles `netlify/function-src/api.js` with esbuild. Frontend is served as a static SPA with catch-all redirect to `index.html`.

**Database layer (`backend/src/config/database.js`):** A custom Prisma-like ORM wrapper over `@supabase/supabase-js`. It exports a `prisma` object with model delegates (`prisma.client.findMany(...)`, `prisma.user.create(...)`, etc.) that translate Prisma-style queries (where, include, orderBy, select) into Supabase calls. The `MODEL_TABLE` map at the top of the file maps model names to Supabase table names. There is no actual Prisma — all DB access goes through this abstraction.

**Auth flow:** JWT-based. Backend issues tokens on login (`POST /api/auth/login`), frontend stores in `localStorage` as `fc_token`. The `authenticate` middleware verifies the JWT and sets `req.userId` + `req.userRole`. Role gating uses `requireRole('TRAINER')`.

**API structure:** All routes are under `/api/` — auth, clients, metrics, workouts, photos, finance, packages, automations. Each domain has its own `routes/*.routes.js` and `controllers/*.controller.js`.

**Frontend API client (`frontend/src/services/api.js`):** Axios instance with auth interceptor. Exports typed API modules: `authApi`, `clientsApi`, `metricsApi`, `workoutsApi`, `photosApi`, `financeApi`, `packagesApi`, `automationsApi`, `publicCheckInApi`, `publicOnlineClientApi`, `publicFeedbackApi`.

**Automations:** WhatsApp campaigns via Twilio. A cron job in `server.js` runs every 15 minutes to execute scheduled automations.

**DB migrations:** SQL files in `backend/supabase/migrations/`. Applied directly to Supabase.

## Development Commands

```bash
# Frontend dev server (port 5173, proxies /api to backend)
cd frontend && npm run dev

# Backend dev server (port 3001, uses nodemon)
cd backend && npm run dev

# Frontend production build
cd frontend && npm run build

# Full Netlify build (frontend + esbuild bundle for serverless function)
npm --prefix frontend ci && npm --prefix frontend run build && frontend/node_modules/.bin/esbuild netlify/function-src/api.js --bundle --platform=node --format=cjs --target=node20 --outfile=netlify/functions-built/api.js
```

Run both frontend and backend dev servers simultaneously for local development. The Vite config proxies `/api` and `/uploads` to `localhost:3001`.

## Environment Variables

Backend requires a `.env` file in `backend/` (see `backend/.env.example`):
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — required for DB access
- `JWT_SECRET` + `JWT_EXPIRES_IN` — required for auth
- `CORS_ORIGIN` — comma-separated allowed origins
- `PUBLIC_APP_URL` — used for generating public links (check-in, feedback)
- `STORAGE_DRIVER` — `"local"` or `"s3"` for photo uploads

Frontend uses `VITE_API_BASE_URL` (defaults to `/api`).

## Key Conventions

- Backend uses ES modules (`"type": "module"` in package.json) — all imports use `.js` extensions
- Errors are thrown as `AppError(message, statusCode)` from `backend/src/utils/AppError.js`
- The `prisma` export from `database.js` is NOT actual Prisma — it's the custom Supabase wrapper; keep API calls compatible with its subset of Prisma's interface
- Frontend routing: trainer-only routes are gated with `<PrivateRoute role="TRAINER">`, client-only with `role="CLIENT"`
- i18n: translation keys in `frontend/src/i18n/locales/{en,pt,de}.json`, language stored in `localStorage` as `fc_lang`
- Public pages (check-in, feedback, online-client) use token-based URLs and `publicApi` (no auth header)
