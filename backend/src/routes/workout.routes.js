import { Router } from 'express';
import multer from 'multer';
import {
	getWorkoutPlan,
	upsertWorkoutPlan,
	duplicateWorkoutPlan,
	extractWorkoutPlanWithAi,
} from '../controllers/workout.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
});
router.use(authenticate);

router.post('/', requireRole('TRAINER'), upsertWorkoutPlan);
router.post('/duplicate', requireRole('TRAINER'), duplicateWorkoutPlan);
router.post('/extract-ai', requireRole('TRAINER'), upload.single('workoutFile'), extractWorkoutPlanWithAi);
router.get('/:clientId', getWorkoutPlan);

export default router;
