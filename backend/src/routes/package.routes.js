import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { listPackages, createPackage, updatePackage, deletePackage } from '../controllers/package.controller.js';

const router = Router();
router.use(authenticate, requireRole('TRAINER'));

router.get('/', listPackages);
router.post('/', createPackage);
router.put('/:id', updatePackage);
router.delete('/:id', deletePackage);

export default router;
