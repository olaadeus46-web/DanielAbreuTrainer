import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  executeAutomation,
  deleteAutomation,
  uploadAttachment,
  getGmailAuthUrl,
  handleGmailCallback,
  getGmailStatus,
  disconnectGmail,
  getWelcomeConfig,
  sendWelcomeEmail,
} from '../controllers/automation.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/automation-attachments'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const router = Router();

router.use(authenticate, requireRole('TRAINER'));

// Gmail OAuth
router.get('/gmail/auth-url',   getGmailAuthUrl);
router.post('/gmail/callback',   handleGmailCallback);
router.get('/gmail/status',      getGmailStatus);
router.delete('/gmail/disconnect', disconnectGmail);

// Welcome email config
router.get('/welcome-config',     getWelcomeConfig);
router.post('/send-welcome-email', sendWelcomeEmail);

// Attachment upload
router.post('/upload-attachment', upload.single('file'), uploadAttachment);

// CRUD + execute
router.get('/',           listAutomations);
router.post('/',          createAutomation);
router.patch('/:id',      updateAutomation);
router.post('/:id/execute', executeAutomation);
router.delete('/:id',     deleteAutomation);

export default router;
