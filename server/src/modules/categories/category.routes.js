import { Router } from 'express';
import { ROLES } from '../../config/constants.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createCategorySchema,
  createChecklistItemSchema,
  idParamSchema,
  updateCategorySchema,
  updateChecklistItemSchema,
} from './category.schemas.js';
import * as categories from './category.service.js';

// Public: active categories for the registration form (BR-006).
export const publicCategoryRoutes = Router();

publicCategoryRoutes.get('/', async (req, res) => {
  res.json({ categories: await categories.listActiveCategories() });
});

// Administrator only (BR-008).
export const adminCategoryRoutes = Router();
adminCategoryRoutes.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

adminCategoryRoutes.get('/', async (req, res) => {
  res.json({ categories: await categories.listAllCategories() });
});

adminCategoryRoutes.post('/', validate(createCategorySchema), async (req, res) => {
  res.status(201).json({ category: await categories.createCategory(req.body, req.user.id) });
});

adminCategoryRoutes.get('/:id', validate(idParamSchema, 'params'), async (req, res) => {
  res.json({ category: await categories.getCategoryWithChecklist(req.params.id) });
});

adminCategoryRoutes.patch('/:id', validate(idParamSchema, 'params'), validate(updateCategorySchema), async (req, res) => {
  res.json({ category: await categories.updateCategory(req.params.id, req.body, req.user.id) });
});

adminCategoryRoutes.post(
  '/:id/checklist',
  validate(idParamSchema, 'params'),
  validate(createChecklistItemSchema),
  async (req, res) => {
    res.status(201).json({ item: await categories.addChecklistItem(req.params.id, req.body, req.user.id) });
  },
);

export const adminChecklistItemRoutes = Router();
adminChecklistItemRoutes.use(requireAuth, requireRole(ROLES.ADMINISTRATOR));

adminChecklistItemRoutes.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateChecklistItemSchema),
  async (req, res) => {
    res.json({ item: await categories.updateChecklistItem(req.params.id, req.body, req.user.id) });
  },
);

adminChecklistItemRoutes.delete('/:id', validate(idParamSchema, 'params'), async (req, res) => {
  await categories.removeChecklistItem(req.params.id, req.user.id);
  res.status(204).end();
});
