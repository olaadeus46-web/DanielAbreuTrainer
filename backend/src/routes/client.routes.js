import { Router } from 'express';
import multer from 'multer';
import {
  listClients, getClient, createClient,
  updateClient, deleteClient, getClientDashboard, extractIntakeWithAi,
  createOnlineClientLink, getPublicOnlineClientLink, submitPublicOnlineClientLink,
  listClientFeedback, listClientFeedbackLinks, createClientFeedbackLink,
  getPublicFeedbackLink, submitPublicFeedbackLink,
} from '../controllers/client.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/public/online-links/:token', getPublicOnlineClientLink);
router.post('/public/online-links/:token/submit', submitPublicOnlineClientLink);
router.get('/public/feedback-links/:token', getPublicFeedbackLink);
router.post('/public/feedback-links/:token/submit', submitPublicFeedbackLink);

router.use(authenticate, requireRole('TRAINER'));

router.get('/', listClients);
router.post('/extract-intake-ai', upload.single('intakeFile'), extractIntakeWithAi);
router.post('/online-links', createOnlineClientLink);
router.get('/:id/feedback', listClientFeedback);
router.get('/:id/feedback-links', listClientFeedbackLinks);
router.post('/:id/feedback-links', createClientFeedbackLink);
router.post('/', createClient);
router.get('/:id', getClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);
router.get('/:id/dashboard', getClientDashboard);

export default router;
