// ============================================================
// Daniel Abreu Trainer SaaS — Middleware
// ============================================================

// ─── authenticate.js ─────────────────────────────────────────
// Verifica o JWT e injeta userId + userRole no req

import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';

export const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Token em falta.', 401));
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId   = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    next(new AppError('Token inválido ou expirado.', 401));
  }
};

// ─── requireRole.js ──────────────────────────────────────────

import { AppError } from '../utils/AppError.js';

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.userRole)) {
    return next(new AppError('Acesso não autorizado.', 403));
  }
  next();
};

// ─── errorHandler.js ─────────────────────────────────────────

export const errorHandler = (err, _req, res, _next) => {
  const status  = err.statusCode || 500;
  const message = err.message    || 'Erro interno do servidor.';

  // Log apenas erros 5xx
  if (status >= 500) console.error('[ERROR]', err);

  res.status(status).json({ error: message });
};

// ─── notFoundHandler.js ──────────────────────────────────────

import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404));
};

// ─── AppError.js (utility) ───────────────────────────────────

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

