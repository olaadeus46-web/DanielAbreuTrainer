export const errorHandler = (err, _req, res, _next) => {
  const status = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor.';
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({ error: message });
};
