import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404));
};
