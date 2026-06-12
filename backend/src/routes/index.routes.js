// ============================================================
// Daniel Abreu Trainer SaaS — Routes
// ============================================================

// ─── auth.routes.js ──────────────────────────────────────────

import { Router } from 'express';
import { register, login, me } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login',    login);
authRouter.get('/me',        authenticate, me);

export default authRouter;

// ============================================================

// ─── client.routes.js ────────────────────────────────────────

import { Router } from 'express';
import {
  listClients, getClient, createClient,
  updateClient, deleteClient, getClientDashboard,
} from '../controllers/client.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole }  from '../middleware/requireRole.js';

const clientRouter = Router();

clientRouter.use(authenticate);
clientRouter.use(requireRole('TRAINER'));

clientRouter.get('/',                    listClients);
clientRouter.post('/',                   createClient);
clientRouter.get('/:id',                 getClient);
clientRouter.put('/:id',                 updateClient);
clientRouter.delete('/:id',              deleteClient);
clientRouter.get('/:id/dashboard',       getClientDashboard);

export default clientRouter;

// ============================================================

// ─── metric.routes.js ────────────────────────────────────────

import { Router } from 'express';
import {
  listDefinitions, createDefinition, updateDefinition, deleteDefinition,
  listEntries, createEntry,
} from '../controllers/metric.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const metricRouter = Router();

metricRouter.use(authenticate);

// Definitions — apenas Trainer
metricRouter.get('/definitions',        listDefinitions);
metricRouter.post('/definitions',       createDefinition);
metricRouter.put('/definitions/:id',    updateDefinition);
metricRouter.delete('/definitions/:id', deleteDefinition);

// Entries — Trainer e Cliente
metricRouter.get('/entries',            listEntries);
metricRouter.post('/entries',           createEntry);

export default metricRouter;

// ============================================================

// ─── workout.routes.js ───────────────────────────────────────

import { Router } from 'express';
import { getWorkoutPlan, upsertWorkoutPlan } from '../controllers/workout.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const workoutRouter = Router();

workoutRouter.use(authenticate);

workoutRouter.get('/:clientId',  getWorkoutPlan);
workoutRouter.post('/',          upsertWorkoutPlan);

export default workoutRouter;

// ============================================================

// ─── finance.routes.js ───────────────────────────────────────

import { Router } from 'express';
import { getFinanceOverview, updatePaymentStatus } from '../controllers/finance.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole }  from '../middleware/requireRole.js';

const financeRouter = Router();

financeRouter.use(authenticate);
financeRouter.use(requireRole('TRAINER'));

financeRouter.get('/overview',                     getFinanceOverview);
financeRouter.patch('/payments/:clientId',         updatePaymentStatus);

export default financeRouter;

