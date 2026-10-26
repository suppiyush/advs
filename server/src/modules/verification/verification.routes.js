import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { correctionSchema, decisionSchema, idParamSchema, listQuerySchema } from './verification.schemas.js';
import * as verification from './verification.service.js';

const staffOnly = [requireAuth, requireRole(ROLES.VERIFIER, ROLES.ADMINISTRATOR)];

// /api/verification: the pending-cases dashboard and the applications in the staff member's scope.
export const verificationRoutes = Router();
verificationRoutes.use(...staffOnly);

verificationRoutes.get('/pending', validate(listQuerySchema, 'query'), async (req, res) => {
  res.json(await verification.getPendingCases(req.user, req.validatedQuery));
});

verificationRoutes.get('/applications', validate(listQuerySchema, 'query'), async (req, res) => {
  res.json({ applications: await verification.listApplications(req.user, req.validatedQuery) });
});

verificationRoutes.get('/applications/:id', validate(idParamSchema, 'params'), async (req, res) => {
  res.json({ application: await verification.getApplicationForStaff(req.user, Number(req.params.id)) });
});

// /api/documents/:id/decision and /correction
export const decisionRoutes = Router();

// BR-002: only verifiers record decisions.
decisionRoutes.post(
  '/:id/decision',
  requireAuth,
  requireRole(ROLES.VERIFIER),
  validate(idParamSchema, 'params'),
  validate(decisionSchema),
  async (req, res) => {
    res.json({ decision: await verification.recordDecision(req.user, Number(req.params.id), req.body) });
  },
);

// FR-019: authorised correction of a recorded decision.
decisionRoutes.post(
  '/:id/correction',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR),
  validate(idParamSchema, 'params'),
  validate(correctionSchema),
  async (req, res) => {
    res.json({ decision: await verification.correctDecision(req.user, Number(req.params.id), req.body) });
  },
);
