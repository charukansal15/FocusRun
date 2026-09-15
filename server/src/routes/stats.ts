import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthedRequest } from '../types.js';
import { getTotals } from '../services/sessions.js';
import { db } from '../db/db.js';
import { ApiError } from '../lib/errors.js';
import { timeRangeStart } from '../services/sessions.js';

const router = Router();
router.get('/', requireAuth, (request: AuthedRequest, response) => response.json(getTotals(request.userId as string)));
router.get('/subjects', requireAuth, (request: AuthedRequest, response, next) => {
  try {
    const range = request.query.range ?? 'week';
    if (range !== 'week' && range !== 'today' && range !== 'month') throw new ApiError(400, 'VALIDATION_ERROR', 'Range must be today, week, or month.');
    const start = timeRangeStart(range, new Date()).toISOString();
    const breakdown = db.prepare(`SELECT COALESCE(subject, 'Other') AS subject, COALESCE(SUM(duration_seconds), 0) AS seconds
      FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND completed_at >= ? GROUP BY COALESCE(subject, 'Other') ORDER BY seconds DESC, subject ASC`).all(request.userId, start) as Array<{ subject: string; seconds: number }>;
    const aggregates = db.prepare(`SELECT COUNT(*) AS totalSessions, COALESCE(AVG(duration_seconds), 0) AS avgSessionSeconds FROM focus_sessions
      WHERE user_id = ? AND status = 'completed' AND completed_at >= ?`).get(request.userId, start) as { totalSessions: number; avgSessionSeconds: number };
    response.json({ breakdown, mostStudied: breakdown[0]?.subject ?? null, totalSessions: aggregates.totalSessions, avgSessionSeconds: Math.floor(aggregates.avgSessionSeconds) });
  } catch (error) { next(error); }
});
export default router;
