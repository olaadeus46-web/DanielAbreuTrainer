import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

async function getTrainerOrThrow(userId) {
  const trainer = await prisma.trainer.findUnique({ where: { userId } });
  if (!trainer) throw new AppError('Trainer não encontrado.', 404);
  return trainer;
}

// GET /api/packages
export const listPackages = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const packages = await prisma.clientPackage.findMany({
      where: { trainerId: trainer.id },
      orderBy: [{ monthlyPrice: 'asc' }, { name: 'asc' }],
    });
    res.json(packages);
  } catch (err) { next(err); }
};

// POST /api/packages
export const createPackage = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const { name, monthlyPrice, description, sessionsPerWeek, sessionsPerMonth, hasOnlineSupport } = req.body;

    if (!name || monthlyPrice === undefined || monthlyPrice === null || monthlyPrice === '') {
      throw new AppError('name e monthlyPrice são obrigatórios.', 400);
    }

    const pkg = await prisma.clientPackage.create({
      data: {
        trainerId: trainer.id,
        name: String(name).trim(),
        monthlyPrice: parseFloat(monthlyPrice),
        description: description ? String(description) : null,
        sessionsPerWeek: sessionsPerWeek === null || sessionsPerWeek === '' || sessionsPerWeek === undefined ? null : parseInt(sessionsPerWeek),
        sessionsPerMonth: sessionsPerMonth === null || sessionsPerMonth === '' || sessionsPerMonth === undefined ? null : parseInt(sessionsPerMonth),
        hasOnlineSupport: hasOnlineSupport === undefined ? true : !!hasOnlineSupport,
      },
    });

    res.status(201).json(pkg);
  } catch (err) { next(err); }
};

// PUT /api/packages/:id
export const updatePackage = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const existing = await prisma.clientPackage.findFirst({ where: { id: req.params.id, trainerId: trainer.id } });
    if (!existing) throw new AppError('Pacote não encontrado.', 404);

    const { name, monthlyPrice, description, sessionsPerWeek, sessionsPerMonth, hasOnlineSupport } = req.body;

    const pkg = await prisma.clientPackage.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(monthlyPrice !== undefined && { monthlyPrice: monthlyPrice === '' || monthlyPrice === null ? 0 : parseFloat(monthlyPrice) }),
        ...(description !== undefined && { description: description || null }),
        ...(sessionsPerWeek !== undefined && { sessionsPerWeek: sessionsPerWeek === '' || sessionsPerWeek === null ? null : parseInt(sessionsPerWeek) }),
        ...(sessionsPerMonth !== undefined && { sessionsPerMonth: sessionsPerMonth === '' || sessionsPerMonth === null ? null : parseInt(sessionsPerMonth) }),
        ...(hasOnlineSupport !== undefined && { hasOnlineSupport: !!hasOnlineSupport }),
      },
    });

    res.json(pkg);
  } catch (err) { next(err); }
};

// DELETE /api/packages/:id
export const deletePackage = async (req, res, next) => {
  try {
    const trainer = await getTrainerOrThrow(req.userId);
    const existing = await prisma.clientPackage.findFirst({ where: { id: req.params.id, trainerId: trainer.id } });
    if (!existing) throw new AppError('Pacote não encontrado.', 404);

    await prisma.$transaction(async (tx) => {
      await tx.client.updateMany({
        where: { trainerId: trainer.id, packageId: existing.id },
        data: { packageId: null },
      });
      await tx.clientPackage.delete({ where: { id: existing.id } });
    });

    res.json({ message: 'Pacote removido com sucesso.' });
  } catch (err) { next(err); }
};
