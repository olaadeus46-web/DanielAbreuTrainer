import { AppError } from '../utils/AppError.js';

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.userRole)) {
    return next(new AppError('Acesso não autorizado.', 403));
  }
  next();
};
