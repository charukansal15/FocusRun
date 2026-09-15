import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { acceptDuel, createDuel, declineDuel, getDuel, listDuels } from '../services/duels.js';
import { requireString } from '../lib/validation.js';

const router = Router();
router.use(requireAuth);
router.post('/', (request: AuthedRequest, response, next) => {
  try {
    const type = request.body?.type;
    if (type !== '24h' && type !== 'week') throw new ApiError(400, 'VALIDATION_ERROR', 'Duel type must be 24h or week.');
    response.status(201).json({ duel: createDuel(request.userId as string, requireString(request.body?.groupId, 'Group', 1, 100), requireString(request.body?.opponentId, 'Opponent', 1, 100), type) });
  } catch (error) { next(error); }
});
router.post('/:id/accept', (request: AuthedRequest, response, next) => { try { response.json({ duel: acceptDuel(request.params.id as string, request.userId as string) }); } catch (error) { next(error); } });
router.post('/:id/decline', (request: AuthedRequest, response, next) => { try { response.json({ duel: declineDuel(request.params.id as string, request.userId as string) }); } catch (error) { next(error); } });
router.get('/:id', (request: AuthedRequest, response, next) => { try { response.json(getDuel(request.params.id as string, request.userId as string)); } catch (error) { next(error); } });
router.get('/', (request: AuthedRequest, response, next) => {
  try {
    const status = request.query.status;
    if (status !== undefined && status !== 'active' && status !== 'completed' && status !== 'open') throw new ApiError(400, 'VALIDATION_ERROR', 'Status must be open, active, or completed.');
    response.json({ duels: listDuels(request.userId as string, status as 'active' | 'completed' | 'open' | undefined) });
  } catch (error) { next(error); }
});
export default router;
