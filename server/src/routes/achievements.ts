import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { achievementDefinitions, unlockedForUser } from '../services/achievements.js';

const router = Router();
router.get('/', requireAuth, (_request, response) => response.json({ achievements: achievementDefinitions() }));
router.get('/me', requireAuth, (request: AuthedRequest, response) => response.json({ unlocked: unlockedForUser(request.userId as string) }));
export default router;
