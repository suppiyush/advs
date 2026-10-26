import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { countUnread, listNotifications, markAllAsRead, markAsRead } from './notification.service.js';

const router = Router();

// Every user only ever sees their own notifications.
router.use(requireAuth);

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });
const idParam = z.object({ id: z.coerce.number({ error: 'Invalid id.' }).int().positive().max(2147483647) });

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const [notifications, unread] = await Promise.all([
    listNotifications(req.user.id, req.validatedQuery),
    countUnread(req.user.id),
  ]);
  res.json({ notifications, unread });
});

router.get('/unread-count', async (req, res) => {
  res.json({ unread: await countUnread(req.user.id) });
});

router.patch('/read-all', async (req, res) => {
  res.json({ updated: await markAllAsRead(req.user.id) });
});

router.patch('/:id/read', validate(idParam, 'params'), async (req, res) => {
  res.json({ notification: await markAsRead(req.user.id, Number(req.params.id)) });
});

export default router;
