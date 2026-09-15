import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { listNotifications, markNotificationRead } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);
router.get('/', (request: AuthedRequest, response) => response.json({ notifications: listNotifications(request.userId as string, request.query.unreadOnly === 'true') }));
router.post('/:id/read', (request: AuthedRequest, response, next) => {
  try {
    if (!markNotificationRead(request.userId as string, request.params.id as string)) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
    response.json({ ok: true });
  } catch (error) { next(error); }
});
export default router;
