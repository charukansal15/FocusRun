import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { createGroup, getGroupWithMembers, joinGroup, listGroups } from '../services/groups.js';
import { requireString } from '../lib/validation.js';
import { groupLeaderboard } from '../services/leaderboard.js';
import { ApiError } from '../lib/errors.js';
import { getActiveChallenge } from '../services/challenges.js';
import { groupActivity } from '../services/activity.js';
import { requireGroupMembership } from '../services/groups.js';

const router = Router();
router.use(requireAuth);

router.post('/', (request: AuthedRequest, response, next) => {
  try { response.status(201).json({ group: createGroup(request.userId as string, requireString(request.body?.name, 'Group name', 2, 60)) }); }
  catch (error) { next(error); }
});

router.post('/join', (request: AuthedRequest, response, next) => {
  try { response.json({ group: joinGroup(request.userId as string, requireString(request.body?.inviteCode, 'Invite code', 6, 6)) }); }
  catch (error) { next(error); }
});

router.get('/', (request: AuthedRequest, response) => response.json({ groups: listGroups(request.userId as string) }));

router.get('/:id/leaderboard', (request: AuthedRequest, response, next) => {
  try {
    const range = request.query.range ?? 'week';
    if (!['today', 'week', 'month', 'all_time'].includes(range as string)) throw new ApiError(400, 'VALIDATION_ERROR', 'Range must be today, week, month, or all_time.');
    response.json({ range, entries: groupLeaderboard(request.params.id as string, request.userId as string, range as 'today' | 'week' | 'month' | 'all_time') });
  } catch (error) { next(error); }
});

router.get('/:id/challenge', (request: AuthedRequest, response, next) => {
  try { response.json(getActiveChallenge(request.userId as string, request.params.id as string)); }
  catch (error) { next(error); }
});

router.get('/:id/activity', (request: AuthedRequest, response, next) => {
  try { requireGroupMembership(request.params.id as string, request.userId as string); response.json({ events: groupActivity(request.params.id as string) }); }
  catch (error) { next(error); }
});

router.get('/:id', (request: AuthedRequest, response, next) => {
  try { response.json(getGroupWithMembers(request.params.id as string, request.userId as string)); }
  catch (error) { next(error); }
});

export default router;
