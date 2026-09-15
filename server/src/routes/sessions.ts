import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { abandonSession, completeSessionWithProgress, listSessions, startSession } from '../services/sessions.js';
import { parseSubject, requirePositiveInteger } from '../lib/validation.js';
import { ApiError } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.post('/start', (request: AuthedRequest, response, next) => {
  try {
    const groupId = request.body?.groupId;
    if (groupId !== undefined && groupId !== null && (typeof groupId !== 'string' || !groupId)) throw new ApiError(400, 'VALIDATION_ERROR', 'Group is invalid.');
    const session = startSession(request.userId as string, groupId ?? null, parseSubject(request.body?.subject), requirePositiveInteger(request.body?.plannedDurationSeconds, 'Planned duration', 60, 14_400));
    response.status(201).json({ session });
  } catch (error) { next(error); }
});

router.post('/:id/complete', (request: AuthedRequest, response, next) => {
  try {
    response.json(completeSessionWithProgress(request.params.id as string, request.userId as string));
  } catch (error) { next(error); }
});

router.post('/:id/abandon', (request: AuthedRequest, response, next) => {
  try { response.json({ session: abandonSession(request.params.id as string, request.userId as string) }); }
  catch (error) { next(error); }
});

router.get('/', (request: AuthedRequest, response, next) => {
  try {
    const range = request.query.range ?? 'week';
    if (range !== 'today' && range !== 'week') throw new ApiError(400, 'VALIDATION_ERROR', 'Range must be today or week.');
    response.json({ sessions: listSessions(request.userId as string, range) });
  } catch (error) { next(error); }
});

export default router;
