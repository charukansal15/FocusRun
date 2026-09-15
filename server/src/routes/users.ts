import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { requirePositiveInteger } from '../lib/validation.js';
import { updateDailyGoal } from '../services/users.js';
import { unlockedForUser } from '../services/achievements.js';
import { progressionForXp } from '../services/progression.js';

const router = Router();
router.use(requireAuth);

router.patch('/me/daily-goal', (request: AuthedRequest, response, next) => {
  try {
    const raw = request.body?.minutes;
    const minutes = raw === null ? null : requirePositiveInteger(raw, 'Daily goal', 1, 600);
    const user = updateDailyGoal(request.userId as string, minutes);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists.');
    response.json({ user: { ...user, ...progressionForXp(user.xp) } });
  } catch (error) { next(error); }
});

router.get('/me/achievements', (request: AuthedRequest, response) => response.json({ unlocked: unlockedForUser(request.userId as string) }));
export default router;
