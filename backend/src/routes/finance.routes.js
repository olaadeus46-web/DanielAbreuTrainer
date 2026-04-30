import { Router } from 'express';
import { getFinanceOverview, getFinanceStats, updatePaymentStatus } from '../controllers/finance.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
router.use(authenticate, requireRole('TRAINER'));

router.get('/overview', getFinanceOverview);
router.get('/stats', getFinanceStats);
router.patch('/payments/:clientId', updatePaymentStatus);

export default router;
