import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { generateSummary, getCategorySummary, getVerificationReport } from './report.service.js';

const router = Router();

// BR-010: aggregated reports are for administrators.
router.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const rangeSchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

router.get('/progress', async (req, res) => {
  res.json(await generateSummary());
});

router.get('/category-summary', async (req, res) => {
  res.json({ categories: await getCategorySummary() });
});

router.get('/verification-activity', validate(rangeSchema, 'query'), async (req, res) => {
  const { from = daysAgo(30), to = today() } = req.validatedQuery;
  res.json(await getVerificationReport({ from, to }));
});

export default router;
