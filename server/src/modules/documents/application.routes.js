import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/errorHandler.js';
import { singleFileUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { uploadSchema } from './document.schemas.js';
import { getApplicationForApplicant, uploadDocument } from './document.service.js';

const router = Router();

// BR-001: only an authenticated applicant can upload.
router.use(requireAuth, requireRole(ROLES.APPLICANT));

router.get('/me', async (req, res) => {
  const application = await getApplicationForApplicant(req.user.id);
  if (!application) {
    throw new AppError(404, 'NO_APPLICATION', 'No application found for your account.');
  }
  res.json({ application });
});

// UC-005 / UC-012. Responds with the updated application so the missing list refreshes at once (AC-05).
router.post('/me/documents', singleFileUpload, validate(uploadSchema), async (req, res) => {
  const result = await uploadDocument(req.user.id, req.body, req.file);
  const application = await getApplicationForApplicant(req.user.id);
  res.status(result.action === 'UPLOADED' ? 201 : 200).json({ result, application });
});

export default router;
