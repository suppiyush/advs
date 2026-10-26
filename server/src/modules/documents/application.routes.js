import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/errorHandler.js';
import { getApplicationForApplicant } from './document.service.js';

const router = Router();

router.get('/me', requireAuth, requireRole(ROLES.APPLICANT), async (req, res) => {
  const application = await getApplicationForApplicant(req.user.id);
  if (!application) {
    throw new AppError(404, 'NO_APPLICATION', 'No application found for your account.');
  }
  res.json({ application });
});

export default router;
