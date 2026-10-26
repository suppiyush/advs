import { Router } from 'express';
import { query } from '../../config/db.js';

const router = Router();

// Public: active categories for the registration form (BR-006). Admin management comes in Increment 2.
router.get('/', async (req, res) => {
  const { rows } = await query(
    'SELECT id, code, name, description FROM categories WHERE is_active ORDER BY name',
  );
  res.json({ categories: rows });
});

export default router;
