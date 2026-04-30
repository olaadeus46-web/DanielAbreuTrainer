import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

const signToken = (userId, role) =>
  jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/register  (apenas Trainers)
export const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      throw new AppError('name, email e password são obrigatórios.', 400);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email já em uso.', 409);

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, role: 'TRAINER' },
      });
      const trainer = await tx.trainer.create({
        data: { userId: user.id, name, phone: phone || null },
      });
      return { user, trainer };
    });

    const token = signToken(result.user.id, 'TRAINER');
    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        name: result.trainer.name,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      throw new AppError('Email e password são obrigatórios.', 400);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { trainer: true, client: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw new AppError('Credenciais inválidas.', 401);

    const token = signToken(user.id, user.role);
    const profile = user.role === 'TRAINER' ? user.trainer : user.client;

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: profile?.name,
        trainerId: user.trainer?.id || null,
        clientId: user.client?.id || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
export const me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { trainer: true, client: true },
    });
    if (!user) throw new AppError('Utilizador não encontrado.', 404);
    const profile = user.role === 'TRAINER' ? user.trainer : user.client;
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      name: profile?.name,
      avatarUrl: profile?.avatarUrl,
      trainerId: user.trainer?.id || null,
      clientId: user.client?.id || null,
    });
  } catch (err) {
    next(err);
  }
};
