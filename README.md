# Daniel Abreu Trainer SaaS

A SaaS platform for personal trainers to manage clients, body metrics, workout plans, progress photos, finance operations, and automated WhatsApp follow-ups.

## Tech Stack
- **Backend**: Node.js, Express, Supabase (PostgreSQL)
- **Frontend**: React, Vite, Recharts
- **Auth**: JWT, bcrypt
- **Validation and Security**: Zod, Helmet, CORS, rate limiting
- **Automation and Messaging**: node-cron, Twilio

---

## Prerequisites
- Node.js 18+
- A Supabase project (URL + Service Role Key)

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
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
JWT_SECRET="fitcoach-dev-secret"
```

### 3. Prepare the database

Run the required SQL migrations in Supabase (tables include users, clients, metric entries, workouts, photos, finance, packages, check-ins, and automations).

### 4. Run the app

```bash
# Terminal 1 - Backend
cd backend
npm run dev
# API: http://localhost:3001

# Terminal 2 - Frontend
cd frontend
npm run dev
# App: http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## Project Structure

```text
DanielAbreuTrainer-main/
├── backend/
│   ├── src/
│   │   ├── config/        # env and database setup
│   │   ├── controllers/   # business logic
│   │   ├── middleware/    # auth, roles, error handling
│   │   ├── routes/        # API endpoints
│   │   ├── utils/
│   │   └── server.js
│   └── supabase/migrations/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── i18n/
│   │   └── App.jsx
└── netlify/
```

---

## Main API Endpoints

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| POST | `/api/auth/register` | Public | Register trainer |
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/auth/me` | Auth | Current profile |
| GET | `/api/clients` | Trainer | List clients |
| POST | `/api/clients` | Trainer | Create client |
| GET | `/api/clients/:id` | Trainer | Client details |
| GET | `/api/clients/:id/dashboard` | Trainer | Client dashboard |
| GET | `/api/metrics/definitions` | Trainer | List metric definitions |
| POST | `/api/metrics/entries` | Trainer + Client | Create metric entry |
| GET | `/api/workouts/:clientId` | Trainer + Client | Get workout plan |
| GET | `/api/photos/:clientId` | Trainer + Client | Get progress photos |
| GET | `/api/finance/overview` | Trainer | Finance overview |
| PATCH | `/api/finance/payments/:clientId` | Trainer | Update payment status |
| GET | `/api/automations` | Trainer | List automations |

---

## Screenshots

### Desktop Views

**Dashboard (Laptop)**

Overview of active clients, collection rate, unpaid follow-up list, and portfolio health cards.

![Laptop Dashboard](./Laptop%20Dashboard.png)

**Clients (Laptop)**

Client roster sorted by operational priority, with fee, frequency, package, and quick profile access.

![Laptop Client Dashboard](./Laptop%20Client%20Dashboard.png)

**Finance (Laptop)**

Financial control center with expected vs received values, pending revenue, collection rate, and client-by-client status.

![Laptop Finance Dashboard](./Laptop%20Finance%20Dashboard.png)

**Automations (Laptop)**

Campaign queue for WhatsApp automations, run status, sent campaigns, and follow-up chains.

![Laptop Automations Dashboard](./Laptop%20Automations%20Dashboard.png)

**Individual Client (Laptop)**

Detailed client workspace with profile summary, KPI cards, metrics analysis, check-ins, files, and training plan tabs.

![Laptop Individual Client](./Laptop%20Individual%20Client.png)

### Mobile Views

**Dashboard (Mobile)**

Responsive dashboard that keeps the same financial and roster priorities in a single-column flow.

![Mobile Dashboard](./mobile%20Dashboard.png)

**Clients (Mobile)**

Mobile-first client cards with payment status, service details, and quick profile navigation.

![Mobile Client Dashboard](./mobile%20Client%20Dashboard.png)

**Finance (Mobile)**

Compact finance screen with tabbed sections and core KPIs for fast daily decisions.

![Mobile Finance Dashboard](./mobile%20Finance%20Dashboard.png)

**Automations (Mobile)**

Mobile automation queue with campaign status chips, queue counters, and detail actions.

![Mobile Automations Dashboard](./mobile%20Automations%20Dashboard.png)

**Individual Client (Mobile)**

Client detail screen adapted for mobile, including top summary, tabs, and metrics cards.

![Mobile Individual Client](./mobile%20Individual%20Client.png)

---

## Useful Commands

```bash
# Start backend
cd backend && npm run dev

# Build frontend for production
cd frontend && npm run build
```

## Deployment (Netlify + custom domain)

In Netlify environment variables:

- `VITE_API_BASE_URL` set to your public API URL (example: `https://api.danieltrainer.com/api`)

In backend production `.env`:

- `PUBLIC_APP_URL="https://danieltrainer.com"`
- `CORS_ORIGIN="https://danieltrainer.com,https://www.danieltrainer.com"`

This ensures:

- public links (check-in, feedback, online client) use the final domain
- frontend points to the correct production API
- CORS accepts your production domains

