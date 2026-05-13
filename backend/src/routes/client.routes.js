import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  listClients, getClient, createClient,
  updateClient, deleteClient, getClientDashboard, extractIntakeWithAi,
  createOnlineClientLink, getPublicOnlineClientLink, submitPublicOnlineClientLink,
  listClientFeedback, listClientFeedbackLinks, createClientFeedbackLink,
  listClientFileFolders, createClientFileFolder, updateClientFileFolder, deleteClientFileFolder,
  createClientFileItem, deleteClientFileItem, downloadClientFileItem,
  getPublicFeedbackLink, submitPublicFeedbackLink,
} from '../controllers/client.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
const intakeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const isServerlessRuntime = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadDirectory = isServerlessRuntime
  ? path.join('/tmp', 'uploads')
  : path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const fileStorage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const fileUpload = multer({ storage: fileStorage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/public/online-links/:token', getPublicOnlineClientLink);
router.post('/public/online-links/:token/submit', submitPublicOnlineClientLink);
router.get('/public/feedback-links/:token', getPublicFeedbackLink);
router.post('/public/feedback-links/:token/submit', submitPublicFeedbackLink);

router.use(authenticate, requireRole('TRAINER'));

router.get('/', listClients);
router.post('/extract-intake-ai', intakeUpload.single('intakeFile'), extractIntakeWithAi);
router.post('/online-links', createOnlineClientLink);
router.get('/:id/feedback', listClientFeedback);
router.get('/:id/feedback-links', listClientFeedbackLinks);
router.post('/:id/feedback-links', createClientFeedbackLink);
router.get('/:id/files/folders', listClientFileFolders);
router.post('/:id/files/folders', createClientFileFolder);
router.patch('/:id/files/folders/:folderId', updateClientFileFolder);
router.delete('/:id/files/folders/:folderId', deleteClientFileFolder);
router.get('/:id/files/items/:itemId/download', downloadClientFileItem);
router.post('/:id/files/items', fileUpload.single('file'), createClientFileItem);
router.delete('/:id/files/items/:itemId', deleteClientFileItem);
router.post('/', createClient);
router.get('/:id', getClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);
router.get('/:id/dashboard', getClientDashboard);

export default router;
