import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { ApiError } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { requireEmail, requireString, parseTheme } from '../lib/validation.js';
import { issueToken, requireAuth } from '../middleware/auth.js';
import type { AuthedRequest, Theme } from '../types.js';
import { findUserById, toUser, updateUserTheme } from '../services/users.js';
import { progressionForXp } from '../services/progression.js';

const router = Router();
type UserRecord = { id: string; username: string; email: string; password_hash: string; preferred_theme: Theme; xp: number; current_streak: number; longest_streak: number; daily_goal_minutes: number | null; last_active_date: string | null; created_at: string };

router.post('/register', async (request, response, next) => {
  try {
    const username = requireString(request.body?.username, 'Username', 3, 30);
    if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new ApiError(400, 'VALIDATION_ERROR', 'Username may only use letters, numbers, and underscores.');
    const email = requireEmail(request.body?.email);
    const password = requireString(request.body?.password, 'Password', 8, 128);
    const exists = db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)').get(email, username);
    if (exists) throw new ApiError(409, 'ACCOUNT_EXISTS', 'That email or username is already in use.');
    const now = new Date().toISOString();
    const row: UserRecord = { id: createId(), username, email, password_hash: await bcrypt.hash(password, 12), preferred_theme: 'deep-focus', xp: 0, current_streak: 0, longest_streak: 0, daily_goal_minutes: null, last_active_date: null, created_at: now };
    db.prepare('INSERT INTO users (id, username, email, password_hash, preferred_theme, xp, current_streak, longest_streak, daily_goal_minutes, last_active_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.id, row.username, row.email, row.password_hash, row.preferred_theme, row.xp, row.current_streak, row.longest_streak, row.daily_goal_minutes, row.last_active_date, row.created_at);
    response.status(201).json({ user: { ...toUser(row), ...progressionForXp(row.xp) }, token: issueToken(row.id) });
  } catch (error) { next(error); }
});

router.post('/login', async (request, response, next) => {
  try {
    const email = requireEmail(request.body?.email);
    const password = requireString(request.body?.password, 'Password', 1, 128);
    const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email) as UserRecord | undefined;
    const accepted = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!accepted || !row) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    response.json({ user: { ...toUser(row), ...progressionForXp(row.xp) }, token: issueToken(row.id) });
  } catch (error) { next(error); }
});

router.post('/logout', (_request, response) => response.json({ ok: true }));

router.get('/me', requireAuth, (request: AuthedRequest, response, next) => {
  try {
    const user = findUserById(request.userId as string);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists.');
    response.json({ user: { ...user, ...progressionForXp(user.xp) } });
  } catch (error) { next(error); }
});

router.patch('/me/theme', requireAuth, (request: AuthedRequest, response, next) => {
  try {
    const user = updateUserTheme(request.userId as string, parseTheme(request.body?.theme));
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists.');
    response.json({ user: { ...user, ...progressionForXp(user.xp) } });
  } catch (error) { next(error); }
});

export default router;
