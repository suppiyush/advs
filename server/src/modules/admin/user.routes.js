import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  auditQuerySchema,
  createUserSchema,
  idParamSchema,
  settingsSchema,
  updateUserSchema,
  userListQuerySchema,
} from './admin.schemas.js';
import { getAuditLog, getSettings, updateSettings } from './system.service.js';
import { createStaffUser, getUser, listUsers, updateUser } from './user.service.js';

// UC-003 Manage Users (FR-005, FR-032)
export const adminUserRoutes = Router();
adminUserRoutes.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

adminUserRoutes.get('/', validate(userListQuerySchema, 'query'), async (req, res) => {
  res.json({ users: await listUsers(req.validatedQuery) });
});

adminUserRoutes.post('/', validate(createUserSchema), async (req, res) => {
  res.status(201).json({ user: await createStaffUser(req.body, req.user.id) });
});

adminUserRoutes.get('/:id', validate(idParamSchema, 'params'), async (req, res) => {
  res.json({ user: await getUser(Number(req.params.id)) });
});

adminUserRoutes.patch('/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), async (req, res) => {
  res.json({ user: await updateUser(Number(req.params.id), req.body, req.user) });
});

// Manage System Configuration: settings (FR-034) and audit log (FR-035)
export const adminSystemRoutes = Router();
adminSystemRoutes.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

adminSystemRoutes.get('/settings', async (req, res) => {
  res.json({ settings: await getSettings() });
});

adminSystemRoutes.put('/settings', validate(settingsSchema), async (req, res) => {
  res.json({ settings: await updateSettings(req.body, req.user.id) });
});

adminSystemRoutes.get('/audit-logs', validate(auditQuerySchema, 'query'), async (req, res) => {
  res.json(await getAuditLog(req.validatedQuery));
});
