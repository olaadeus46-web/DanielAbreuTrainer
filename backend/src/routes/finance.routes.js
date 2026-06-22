import { Router } from 'express';
import multer from 'multer';
import {
	createExpense,
	deleteExpense,
	downloadExpenseAttachment,
	getFinanceOverview,
	getFinanceStats,
	listExpenses,
	updateExpectedAmount,
	updateExpense,
	updatePaymentStatus,
} from '../controllers/finance.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
router.use(authenticate, requireRole('TRAINER'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.get('/overview', getFinanceOverview);
router.get('/stats', getFinanceStats);
router.patch('/payments/:clientId', updatePaymentStatus);
router.patch('/payments/:clientId/expected', updateExpectedAmount);
router.get('/expenses', listExpenses);
router.get('/expenses/:id/attachment/download', downloadExpenseAttachment);
router.post('/expenses', upload.single('attachment'), createExpense);
router.patch('/expenses/:id', upload.single('attachment'), updateExpense);
router.delete('/expenses/:id', deleteExpense);

export default router;
