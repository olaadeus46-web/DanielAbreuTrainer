# Daniel Abreu Trainer SaaS

Plataforma para Personal Trainers gerirem clientes, métricas e pagamentos.

## Stack
- **Backend**: Node.js · Express · Supabase (PostgreSQL)
- **Frontend**: React · Vite · Recharts
- **Auth**: JWT · bcrypt

---

## Pré-requisitos

- Node.js 18+
- Projeto Supabase criado (URL + Service Role Key)

---

## Setup em 5 passos

### 1. Instalar dependências

```bash
# Backend
cd backend
npm install

# Frontend (noutra janela do terminal)
cd frontend
npm install
```

### 2. Configurar o .env

```bash
cd backend
cp .env.example .env
```

Edita o `.env` e preenche as variaveis do Supabase:
```
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
JWT_SECRET="fitcoach-dev-secret"
```

### 3. Preparar a base de dados

```bash
# Cria as tabelas no Supabase SQL Editor
# (User, Trainer, Client, MetricDefinition, MetricEntry,
# WorkoutPlan, WorkoutDay, Exercise, ProgressPhoto, Payment,
# MetricPreset, MetricPresetItem, CheckIn)
```

### 4. Arrancar

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# API a correr em http://localhost:3001

# Terminal 2 — Frontend
cd frontend
npm run dev
# App a correr em http://localhost:5173
```

Abre http://localhost:5173 no browser!

---

## Estrutura do projeto

```
fitcoach-saas/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js      ← Supabase client + adapter compatível
│   │   ├── controllers/         ← Lógica de negócio
│   │   │   ├── auth.controller.js
│   │   │   ├── client.controller.js
│   │   │   ├── metric.controller.js
│   │   │   ├── workout.controller.js
│   │   │   ├── finance.controller.js
│   │   │   └── photo.controller.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js  ← Verificação JWT
│   │   │   ├── requireRole.js   ← Controlo de acesso
│   │   │   ├── errorHandler.js
│   │   │   └── notFoundHandler.js
│   │   ├── routes/              ← Definição de endpoints
│   │   ├── utils/
│   │   │   └── AppError.js
│   │   └── server.js            ← Entry point
│   ├── uploads/                 ← Fotos de progresso (local)
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/          ← Componentes React
    │   ├── context/
    │   │   └── AuthContext.jsx  ← Estado global de autenticação
    │   ├── pages/               ← Páginas da app
    │   ├── services/
    │   │   └── api.js           ← Chamadas à API
    │   ├── App.jsx              ← Routing
    │   └── main.jsx
    ├── index.html
    └── package.json
```

---

## Endpoints principais

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| POST | `/api/auth/register` | Público | Registar trainer |
| POST | `/api/auth/login` | Público | Login |
| GET | `/api/auth/me` | Auth | Perfil atual |
| GET | `/api/clients` | Trainer | Lista de clientes |
| POST | `/api/clients` | Trainer | Criar cliente |
| GET | `/api/clients/:id` | Trainer | Detalhes do cliente |
| GET | `/api/clients/:id/dashboard` | Trainer | Dashboard do cliente |
| GET | `/api/metrics/definitions` | Trainer | Métricas configuradas |
| POST | `/api/metrics/definitions` | Trainer | Criar métrica |
| GET | `/api/metrics/entries` | Trainer+Cliente | Ver entradas |
| POST | `/api/metrics/entries` | Trainer+Cliente | Registar entrada |
| GET | `/api/workouts/:clientId` | Trainer+Cliente | Plano de treino |
| POST | `/api/workouts` | Trainer | Guardar plano |
| GET | `/api/photos/:clientId` | Trainer+Cliente | Galeria |
| POST | `/api/photos` | Trainer+Cliente | Upload foto |
| GET | `/api/finance/overview` | Trainer | Resumo financeiro |
| PATCH | `/api/finance/payments/:clientId` | Trainer | Atualizar pagamento |

---

## Comandos úteis

```bash
# Iniciar backend
cd backend && npm run dev

# Build de produção (frontend)
cd frontend && npm run build
```

## Deploy (Netlify + dominio custom)

No Netlify (Site settings > Environment variables):

- `VITE_API_BASE_URL`: URL publica da tua API (exemplo: `https://api.danieltrainer.com/api`)

No backend (`backend/.env` em produção):

- `PUBLIC_APP_URL="https://danieltrainer.com"`
- `CORS_ORIGIN="https://danieltrainer.com,https://www.danieltrainer.com"`

Isto garante:

- links publicos (check-in/feedback/online-client) com o dominio final;
- frontend no dominio custom a comunicar com a API correta;
- CORS a aceitar o dominio de produção.

