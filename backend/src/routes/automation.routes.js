import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  executeAutomation,
  deleteAutomation,
} from '../controllers/automation.controller.js';

const router = Router();

router.use(authenticate, requireRole('TRAINER'));

router.get('/',           listAutomations);
router.post('/',          createAutomation);
router.patch('/:id',      updateAutomation);
router.post('/:id/execute', executeAutomation);
router.delete('/:id',     deleteAutomation);

export default router;
