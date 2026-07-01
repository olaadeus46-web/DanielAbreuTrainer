# Daniel Abreu Personal Trainer

<p align="center">
  <img src="./Daniel%20Abreu.png" alt="Daniel Abreu Personal Trainer" width="180" />
</p>

A custom-built management platform for **Daniel Abreu**, a personal trainer based in Germany. This is not a generic SaaS — it was designed and developed specifically for Daniel to run his personal training business: manage clients, track body metrics, automate email campaigns, handle finances, and deliver a professional experience to his clients.

**The app is live and in production at [danieltrainer.com](https://danieltrainer.com).**

---

## Features

### Client Management
- Full client roster with profile, contact info, service package, training frequency, and payment status
- Individual client workspace with KPI cards, metrics history, check-in history, files, and training plan tabs
- Client portal where clients log in to view their own metrics and progress

### Body Metrics & Check-ins
- Custom metric definitions (weight, body fat %, measurements, etc.) tracked over time
- Interactive charts (Recharts) showing client progress across all metrics
- Public check-in forms — clients receive a unique link (via email) to submit their metrics without needing to log in
- PDF parsing support for importing metric data from documents

### Workout Plans
- Create and assign workout plans per client
- Clients can view their current training plan from their own portal

### Progress Photos
- Upload and organize before/after progress photos per client
- Photo storage supports local filesystem or S3

### Finance
- Financial dashboard with expected vs received revenue, pending amounts, and collection rate
- Monthly payment tracking per client with status management (paid, pending, overdue)
- Expense tracking with receipt attachments (stored in Supabase Storage)
- Service packages with pricing — assign packages to clients and track revenue automatically

### Email Automations (Gmail API)
- **Gmail OAuth integration** — Daniel connects his own Gmail account via Google OAuth 2.0
- Automated email campaigns for check-in reminders, feedback requests, and free-form messages
- **Campaign types:** Check-in, Feedback, Message Only, and Client Welcome Email
- Scheduled sending — campaigns can be sent immediately or scheduled for a future date/time
- **Follow-up chains** — create follow-up automations that trigger automatically after a parent campaign is sent, with configurable delay (in days)
- Smart follow-up logic that skips clients who already submitted the original form
- Branded HTML email templates with Daniel's branding, auto-generated from plain text
- Template variables (`{{name}}`, `{{link}}`) for personalised messages
- File attachments support (up to 15 MB per file)
- Welcome email configuration — auto-send a branded onboarding email when a new client is created
- **Cron job** (Netlify Scheduled Function, every 5 minutes) automatically executes pending scheduled automations

### Public Pages (No Login Required)
- **Check-in form** — clients fill in their latest metrics via a tokenized URL
- **Feedback form** — clients submit feedback about their training experience
- **Online client intake** — new clients fill in an onboarding form to get started

### Multi-language Support
- UI available in **English**, **Portuguese**, and **German** via i18next
- Language preference stored per user in localStorage

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, React Router v6, Zustand, Recharts, i18next |
| **Backend** | Node.js, Express, ES Modules, JWT (bcrypt) |
| **Database** | Supabase (PostgreSQL) with a custom Prisma-like ORM wrapper |
| **Email** | Gmail API (googleapis), Nodemailer (for MIME composition) |
| **Deployment** | Netlify (static SPA + serverless functions via esbuild) |
| **Security** | Helmet, CORS, rate limiting, Zod validation |
| **Scheduling** | Netlify Scheduled Functions (cron) |

---

## Architecture

```text
DanielAbreuTrainer/
├── backend/
│   ├── src/
│   │   ├── config/          # env, database (Supabase ORM wrapper)
│   │   ├── controllers/     # auth, clients, metrics, workouts, photos, finance, packages, automations
│   │   ├── middleware/       # JWT auth, role gating, error handling
│   │   ├── routes/           # API route definitions
│   │   ├── services/         # gmail.service.js (Google OAuth + Gmail API)
│   │   ├── utils/            # AppError, helpers
│   │   └── server.js         # Express entry point
│   └── supabase/migrations/  # SQL migration files
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # AuthContext (JWT + role-based)
│   │   ├── pages/            # All page components (dashboard, clients, finance, automations, public pages)
│   │   ├── services/         # Axios API client with auth interceptor
│   │   ├── i18n/             # Translations (en, pt, de)
│   │   └── App.jsx           # Route definitions
└── netlify/
    └── function-src/         # Serverless entry points (api.js, cron-automations.js)
```

**Two user roles:**
- **TRAINER** (Daniel) — full access to all management features
- **CLIENT** — limited portal to view own metrics, workout plan, and progress

---

## Prerequisites

- Node.js 18+
- A Supabase project (URL + Service Role Key)
- A Google Cloud project with Gmail API enabled (for email automations)

---

## Setup

### 1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in another terminal)
cd frontend
npm install
```

### 2. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and fill in your values:

```env
# Supabase
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# JWT
JWT_SECRET="<random-secret>"
JWT_EXPIRES_IN="7d"

# App
PUBLIC_APP_URL="https://danieltrainer.com"
CORS_ORIGIN="http://localhost:5173,https://danieltrainer.com"

# Google OAuth (for Gmail email automations)
GOOGLE_CLIENT_ID="<your-google-client-id>"
GOOGLE_CLIENT_SECRET="<your-google-client-secret>"

# Photo storage: "local" or "s3"
STORAGE_DRIVER="local"
```

### 3. Prepare the database

Run the SQL migrations in `backend/supabase/migrations/` on your Supabase project.

### 4. Run the app

```bash
# Terminal 1 — Backend (port 3001)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173, proxies /api to backend)
cd frontend && npm run dev
```

Open http://localhost:5173 in your browser.

---

## Main API Endpoints

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| POST | `/api/auth/register` | Public | Register |
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/auth/me` | Auth | Current profile |
| GET | `/api/clients` | Trainer | List clients |
| POST | `/api/clients` | Trainer | Create client |
| GET | `/api/clients/:id` | Trainer | Client details |
| GET | `/api/clients/:id/dashboard` | Trainer | Client dashboard |
| GET | `/api/metrics/definitions` | Trainer | Metric definitions |
| POST | `/api/metrics/entries` | Trainer + Client | Create metric entry |
| GET | `/api/workouts/:clientId` | Trainer + Client | Workout plan |
| GET | `/api/photos/:clientId` | Trainer + Client | Progress photos |
| GET | `/api/finance/overview` | Trainer | Finance overview |
| PATCH | `/api/finance/payments/:clientId` | Trainer | Update payment |
| GET | `/api/automations` | Trainer | List automations |
| POST | `/api/automations` | Trainer | Create automation |
| POST | `/api/automations/:id/execute` | Trainer | Execute automation |
| GET | `/api/automations/gmail/status` | Trainer | Gmail connection status |
| GET | `/api/automations/gmail/auth-url` | Trainer | Gmail OAuth URL |
| POST | `/api/automations/gmail/callback` | Trainer | Gmail OAuth callback |
| POST | `/api/automations/send-welcome-email` | Trainer | Send welcome email |

---

## Screenshots

### Desktop Views

**Dashboard**

Overview of active clients, collection rate, unpaid follow-up list, and portfolio health cards.

![Laptop Dashboard](./Laptop%20Dashboard.png)

**Clients**

Client roster sorted by operational priority, with fee, frequency, package, and quick profile access.

![Laptop Client Dashboard](./Laptop%20Client%20Dashboard.png)

**Finance**

Financial control center with expected vs received values, pending revenue, collection rate, and client-by-client status.

![Laptop Finance Dashboard](./Laptop%20Finance%20Dashboard.png)

**Automations**

Email campaign queue with automation status, sent campaigns, follow-up chains, and Gmail integration.

![Laptop Automations Dashboard](./Laptop%20Automations%20Dashboard.png)

**Individual Client**

Detailed client workspace with profile summary, KPI cards, metrics analysis, check-ins, files, and training plan tabs.

![Laptop Individual Client](./Laptop%20Individual%20Client.png)

### Mobile Views

**Dashboard**

![Mobile Dashboard](./mobile%20Dashboard.png)

**Clients**

![Mobile Client Dashboard](./mobile%20Client%20Dashboard.png)

**Finance**

![Mobile Finance Dashboard](./mobile%20Finance%20Dashboard.png)

**Automations**

![Mobile Automations Dashboard](./mobile%20Automations%20Dashboard.png)

**Individual Client**

![Mobile Individual Client](./mobile%20Individual%20Client.png)

---

## Deployment

The app is deployed on **Netlify**:
- Frontend is served as a static SPA
- Backend runs as a Netlify Serverless Function (bundled with esbuild)
- A Netlify Scheduled Function runs every 5 minutes to execute pending email automations

### Production environment variables (Netlify)

```env
VITE_API_BASE_URL="https://api.danieltrainer.com/api"
PUBLIC_APP_URL="https://danieltrainer.com"
CORS_ORIGIN="https://danieltrainer.com,https://www.danieltrainer.com"
```
