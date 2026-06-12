import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { listPhotos, uploadPhoto, deletePhoto } from '../controllers/photo.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const isServerlessRuntime = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadDirectory = isServerlessRuntime
  ? path.join('/tmp', 'uploads')
  : path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDirectory,
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
