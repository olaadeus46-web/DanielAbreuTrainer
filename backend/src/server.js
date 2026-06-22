import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import './config/env.js';
import { fileURLToPath } from 'url';
import path from 'path';

import authRoutes       from './routes/auth.routes.js';
import clientRoutes     from './routes/client.routes.js';
import metricRoutes     from './routes/metric.routes.js';
import workoutRoutes    from './routes/workout.routes.js';
import photoRoutes      from './routes/photo.routes.js';
import financeRoutes    from './routes/finance.routes.js';
import packageRoutes    from './routes/package.routes.js';
import automationRoutes from './routes/automation.routes.js';
import { executeAutomationById } from './controllers/automation.controller.js';
import { prisma } from './config/database.js';

import { errorHandler }    from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

let __dirname;
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  __dirname = process.cwd();
}
const app = express();
const PORT = process.env.PORT || 3001;

const DEFAULT_PUBLIC_APP_URL = 'https://danieltrainer.com';

function parseAllowedOrigins(originsValue) {
  const defaults = [
    'http://localhost:5173',
    'https://danieltrainer.com',
    'https://www.danieltrainer.com',
  ];
  const configured = String(originsValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...defaults])];
}

const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN || process.env.PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL);

// ── Security & Middleware ─────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// ── Static uploads ────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/clients',  clientRoutes);
app.use('/api/metrics',  metricRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/photos',   photoRoutes);
app.use('/api/finance',      financeRoutes);
app.use('/api/packages',     packageRoutes);
app.use('/api/automations',  automationRoutes);

// ── Error Handling ───────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

const isServerlessRuntime = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isServerlessRuntime) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Daniel Abreu Trainer API running on http://localhost:${PORT}`);
    console.log(`   Docs:   http://localhost:${PORT}/health`);
    console.log(`   Env:    ${process.env.NODE_ENV || 'development'}\n`);
  });

  import('node-cron').then(({ default: cron }) => {
    cron.schedule('* * * * *', async () => {
      try {
        const now = Date.now();
        const pending = await prisma.automation.findMany({
          where: { status: 'PENDING', sendMode: 'SCHEDULED' },
        });
        const due = pending.filter((a) => a.scheduledAt && new Date(a.scheduledAt).getTime() <= now);
        for (const automation of due) {
          try {
            console.log(`[cron] Executing automation: ${automation.name} (${automation.id})`);
            await executeAutomationById(automation.id);
          } catch (err) {
            console.error(`[cron] Failed automation ${automation.id}:`, err.message);
          }
        }
      } catch (err) {
        console.error('[cron] Scheduler error:', err.message);
      }
    });
  });
}

export default app;

