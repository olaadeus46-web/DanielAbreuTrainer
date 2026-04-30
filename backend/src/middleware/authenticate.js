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
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    next(new AppError('Token inválido ou expirado.', 401));
  }
};
