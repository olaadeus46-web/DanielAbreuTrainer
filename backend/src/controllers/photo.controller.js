import path from 'path';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

async function assertAccess(userId, role, clientId) {
  if (role === 'TRAINER') {
    const trainer = await prisma.trainer.findUnique({ where: { userId } });
    if (!trainer) throw new AppError('Não autorizado.', 403);
    const client = await prisma.client.findFirst({ where: { id: clientId, trainerId: trainer.id } });
    if (!client) throw new AppError('Cliente não encontrado.', 404);
  } else {
    const client = await prisma.client.findFirst({ where: { id: clientId, user: { id: userId } } });
    if (!client) throw new AppError('Não autorizado.', 403);
  }
}

// GET /api/photos/:clientId
export const listPhotos = async (req, res, next) => {
  try {
    await assertAccess(req.userId, req.userRole, req.params.clientId);
    const photos = await prisma.progressPhoto.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { takenAt: 'desc' },
    });
    res.json(photos);
  } catch (err) { next(err); }
};

// POST /api/photos  (requer multer no route)
export const uploadPhoto = async (req, res, next) => {
  try {
    const { clientId, checkInId, notes, tags, takenAt } = req.body;
    await assertAccess(req.userId, req.userRole, clientId);

    if (!req.file) throw new AppError('Ficheiro não enviado.', 400);

    const url = `/uploads/${req.file.filename}`;

    const photo = await prisma.progressPhoto.create({
      data: {
        clientId,
        checkInId: checkInId || null,
        url,
        notes: notes || null,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
        takenAt: takenAt ? new Date(takenAt) : new Date(),
      },
    });
    res.status(201).json(photo);
  } catch (err) { next(err); }
};

// DELETE /api/photos/:id
export const deletePhoto = async (req, res, next) => {
  try {
    const photo = await prisma.progressPhoto.findUnique({ where: { id: req.params.id } });
    if (!photo) throw new AppError('Foto não encontrada.', 404);
    await assertAccess(req.userId, req.userRole, photo.clientId);
    await prisma.progressPhoto.delete({ where: { id: req.params.id } });
    res.json({ message: 'Foto removida.' });
  } catch (err) { next(err); }
};
