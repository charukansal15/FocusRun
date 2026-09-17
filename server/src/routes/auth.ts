import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/query.js';
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
    const exists = (await query<{ exists: number }>('SELECT 1 AS exists FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($2) LIMIT 1', [email, username]))[0];
    if (exists) throw new ApiError(409, 'ACCOUNT_EXISTS', 'That email or username is already in use.');
    const now = new Date().toISOString();
    const row: UserRecord = { id: createId(), username, email, password_hash: await bcrypt.hash(password, 12), preferred_theme: 'deep-focus', xp: 0, current_streak: 0, longest_streak: 0, daily_goal_minutes: null, last_active_date: null, created_at: now };
    await query(
      `INSERT INTO users (
        id, username, email, password_hash, preferred_theme, xp,
        current_streak, longest_streak, daily_goal_minutes,
        last_active_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        row.id,
        row.username,
        row.email,
        row.password_hash,
        row.preferred_theme,
        row.xp,
        row.current_streak,
        row.longest_streak,
        row.daily_goal_minutes,
        row.last_active_date,
        row.created_at,
      ],
    );
    response.status(201).json({ user: { ...toUser(row), ...progressionForXp(row.xp) }, token: issueToken(row.id) });
  } catch (error) { next(error); }
});

router.post('/login', async (request, response, next) => {
  try {
    const email = requireEmail(request.body?.email);
    const password = requireString(request.body?.password, 'Password', 1, 128);
    const row = (await query<UserRecord>('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]))[0];
    const accepted = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!accepted || !row) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    response.json({ user: { ...toUser(row), ...progressionForXp(row.xp) }, token: issueToken(row.id) });
  } catch (error) { next(error); }
});

router.post('/logout', (_request, response) => response.json({ ok: true }));

router.get('/me', requireAuth, async (request: AuthedRequest, response, next) => {
  try {
    const user = await findUserById(request.userId as string);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists.');
    response.json({ user: { ...user, ...progressionForXp(user.xp) } });
  } catch (error) { next(error); }
});

router.patch('/me/theme', requireAuth, async (request: AuthedRequest, response, next) => {
  try {
    const user = await updateUserTheme(request.userId as string, parseTheme(request.body?.theme));
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists.');
    response.json({ user: { ...user, ...progressionForXp(user.xp) } });
  } catch (error) { next(error); }
});

export default router;
