import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { createChallenge } from '../services/challenges.js';
import { requireString } from '../lib/validation.js';
import { ApiError } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

function requiredDate(value: unknown, label: string): string {
  const date = requireString(value, label, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be YYYY-MM-DD.`);
  return date;
}

router.post('/', (request: AuthedRequest, response, next) => {
  try {
    const description = request.body?.description === undefined || request.body?.description === '' ? null : requireString(request.body.description, 'Description', 1, 240);
    const challenge = createChallenge(request.userId as string, requireString(request.body?.groupId, 'Group', 1, 100), requireString(request.body?.title, 'Title', 2, 80), description, requiredDate(request.body?.startDate, 'Start date'), requiredDate(request.body?.endDate, 'End date'));
    response.status(201).json({ challenge });
  } catch (error) { next(error); }
});

export default router;
