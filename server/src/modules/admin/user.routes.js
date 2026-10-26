import { Router } from 'express';
import { query } from '../../config/db.js';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { toPublicUser } from '../auth/auth.service.js';

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

// Read-only user list for now; create / role change / deactivate arrive in Increment 6 (FR-032).
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, phone, role, is_active, assigned_category_id, created_at
       FROM users ORDER BY role, name`,
  );
  res.json({ users: rows.map(toPublicUser) });
});

export default router;
