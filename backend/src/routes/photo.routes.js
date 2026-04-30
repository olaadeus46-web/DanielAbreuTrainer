import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { listPhotos, uploadPhoto, deletePhoto } from '../controllers/photo.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

router.get('/:clientId', listPhotos);
router.post('/', upload.single('photo'), uploadPhoto);
router.delete('/:id', deletePhoto);

export default router;
