import { Router } from 'express';
import multer from 'multer';
import {
  listDefinitions, createDefinition, updateDefinition, deleteDefinition,
  listEntries, listCheckIns, listCheckInLinks, createCheckInLink, getPublicCheckInLink, submitPublicCheckInLink,
  createEntry, updateEntry, bulkUpsertEntries, createStructuredCheckIn, importPdfSheet,
  copyDefinitionsFromClient, listMetricPresets, saveMetricPreset, applyMetricPreset,
} from '../controllers/metric.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/public/checkin-links/:token', getPublicCheckInLink);
router.post('/public/checkin-links/:token/submit', submitPublicCheckInLink);

router.use(authenticate);

// Definitions — só TRAINER
router.get('/definitions', listDefinitions);
router.post('/definitions', requireRole('TRAINER'), createDefinition);
router.post('/definitions/copy-from-client', requireRole('TRAINER'), copyDefinitionsFromClient);
router.put('/definitions/:id', requireRole('TRAINER'), updateDefinition);
router.delete('/definitions/:id', requireRole('TRAINER'), deleteDefinition);

router.get('/presets', requireRole('TRAINER'), listMetricPresets);
router.post('/presets', requireRole('TRAINER'), saveMetricPreset);
router.post('/presets/:id/apply', requireRole('TRAINER'), applyMetricPreset);

// Entries — TRAINER e CLIENT
router.get('/entries', listEntries);
router.get('/checkins', listCheckIns);
router.get('/checkin-links', listCheckInLinks);
router.post('/checkin-links', requireRole('TRAINER'), createCheckInLink);
router.post('/entries', createEntry);
router.put('/entries/:id', updateEntry);
router.post('/entries/bulk-upsert', bulkUpsertEntries);
router.post('/checkins', createStructuredCheckIn);
router.post(
  '/import-pdf',
  requireRole('TRAINER'),
  upload.fields([
    { name: 'sheetFile', maxCount: 1 },
    { name: 'sheetPdf', maxCount: 1 },
  ]),
  importPdfSheet,
);

export default router;
