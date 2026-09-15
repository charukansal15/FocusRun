import { db } from '../db/db.js';
import { ApiError } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import type { FocusSession, Subject } from '../types.js';
import { requireGroupMembership } from './groups.js';
import { BATTLE_WIN_BONUS_XP, DAILY_GOAL_BONUS_XP, ACTIVITY_MINIMUM_SECONDS, levelForXp, progressionForXp } from './progression.js';
import { unlockEligibleAchievements } from './achievements.js';
import { createNotification } from './notifications.js';
import { logActivity } from './activity.js';
import { groupLeaderboard } from './leaderboard.js';
import { resolveExpiredDuels } from './duels.js';

const graceSeconds = 8;
type SessionRow = {
  id: string; user_id: string; group_id: string | null; subject: Subject | null; duration_seconds: number;
  planned_duration_seconds: number; started_at: string; completed_at: string | null; status: FocusSession['status'];
};

export function toSession(row: SessionRow): FocusSession {
  return {
    id: row.id, userId: row.user_id, groupId: row.group_id, subject: row.subject, durationSeconds: row.duration_seconds,
    plannedDurationSeconds: row.planned_duration_seconds, startedAt: row.started_at, completedAt: row.completed_at, status: row.status,
  };
}

function sessionForUser(id: string, userId: string): SessionRow {
  const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?').get(id, userId) as SessionRow | undefined;
  if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Focus session not found.');
  return row;
}

export function startSession(userId: string, groupId: string | null, subject: Subject | null, plannedDurationSeconds: number, now = new Date()): FocusSession {
  if (groupId) requireGroupMembership(groupId, userId);
  const session: FocusSession = {
    id: createId(), userId, groupId, subject, durationSeconds: 0, plannedDurationSeconds,
    startedAt: now.toISOString(), completedAt: null, status: 'active',
  };
  db.prepare(`INSERT INTO focus_sessions
    (id, user_id, group_id, subject, duration_seconds, planned_duration_seconds, started_at, completed_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(session.id, session.userId, session.groupId, session.subject, session.durationSeconds, session.plannedDurationSeconds, session.startedAt, null, session.status);
  return session;
}

export function completeSession(id: string, userId: string, now = new Date()): FocusSession {
  return completeSessionWithProgress(id, userId, now).session;
}

export interface CompleteSessionResult {
  session: FocusSession;
  totals: { todaySeconds: number; totalSeconds: number };
  xpAwarded: number;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  leveledUp: boolean;
  newLevel?: number;
  streak: { current: number; longest: number };
  dailyGoal?: { goalMinutes: number; todayMinutes: number; justCompleted: boolean };
  achievementsUnlocked: import('../types.js').Achievement[];
}

type ProgressRow = { xp: number; current_streak: number; longest_streak: number; daily_goal_minutes: number | null; last_active_date: string | null };
const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

function rawXpForUser(userId: string): number {
  const sessionXp = (db.prepare("SELECT COALESCE(SUM(CAST(duration_seconds / 60 AS INTEGER)), 0) AS xp FROM focus_sessions WHERE user_id = ? AND status = 'completed'").get(userId) as { xp: number }).xp;
  const bonusXp = (db.prepare('SELECT COALESCE(SUM(xp_awarded), 0) AS xp FROM daily_goal_rewards WHERE user_id = ?').get(userId) as { xp: number }).xp;
  const battleWins = (db.prepare('SELECT COUNT(*) AS count FROM challenges WHERE winner_id = ? AND bonus_awarded = 1').get(userId) as { count: number }).count;
  return sessionXp + bonusXp + battleWins * BATTLE_WIN_BONUS_XP;
}

export function refreshCachedXp(userId: string): void {
  db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(rawXpForUser(userId), userId);
}

function countSessionsOnUtcDay(userId: string, day: string): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND substr(completed_at, 1, 10) = ?").get(userId, day) as { count: number }).count;
}

function totalSecondsForTodayUtc(userId: string, day: string): number {
  return (db.prepare("SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND substr(completed_at, 1, 10) = ?").get(userId, day) as { seconds: number }).seconds;
}

export function completeSessionWithProgress(id: string, userId: string, now = new Date()): CompleteSessionResult {
  const current = sessionForUser(id, userId);
  if (current.status !== 'active') throw new ApiError(409, 'SESSION_NOT_ACTIVE', 'Only an active focus session can be completed.');
  const work = db.transaction(() => {
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(current.started_at).getTime()) / 1000));
    const durationSeconds = Math.min(elapsed, current.planned_duration_seconds + graceSeconds);
    const completedAt = now.toISOString();
    const session = toSession({ ...current, duration_seconds: durationSeconds, completed_at: completedAt, status: 'completed' });
    const oldXp = rawXpForUser(userId);
    const account = db.prepare('SELECT xp, current_streak, longest_streak, daily_goal_minutes, last_active_date FROM users WHERE id = ?').get(userId) as ProgressRow | undefined;
    if (!account) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists.');
    db.prepare('UPDATE focus_sessions SET duration_seconds = ?, completed_at = ?, status = ? WHERE id = ?').run(durationSeconds, completedAt, 'completed', id);

    const today = utcDay(now);
    const currentStreak = calculateStreak(userId, now);
    const longestStreak = Math.max(account.longest_streak, calculateLongestStreak(userId));
    const todaySeconds = totalSecondsForTodayUtc(userId, today);
    const todayMinutes = Math.floor(todaySeconds / 60);
    let goalJustCompleted = false;
    if (account.daily_goal_minutes && todayMinutes >= account.daily_goal_minutes) {
      const insert = db.prepare('INSERT OR IGNORE INTO daily_goal_rewards (user_id, reward_date, xp_awarded) VALUES (?, ?, ?)').run(userId, today, DAILY_GOAL_BONUS_XP);
      goalJustCompleted = insert.changes > 0;
    }
    const xp = rawXpForUser(userId);
    const levelBefore = levelForXp(oldXp);
    const level = levelForXp(xp);
    db.prepare('UPDATE users SET xp = ?, current_streak = ?, longest_streak = ?, last_active_date = ? WHERE id = ?').run(xp, currentStreak, longestStreak, today, userId);
    const totals = getTotals(userId, now);
    const weeklyRank = session.groupId ? groupLeaderboard(session.groupId, userId, 'week', now).find((entry) => entry.userId === userId)?.rank ?? null : null;
    const duelWins = (db.prepare("SELECT COUNT(*) as count FROM duels WHERE winner_id = ? AND status = 'completed'").get(userId) as { count: number }).count;
    const achievementsUnlocked = unlockEligibleAchievements(userId, {
      completedSessions: (db.prepare("SELECT COUNT(*) AS count FROM focus_sessions WHERE user_id = ? AND status = 'completed'").get(userId) as { count: number }).count,
      totalSeconds: totals.totalSeconds,
      sessionsToday: countSessionsOnUtcDay(userId, today),
      currentStreak,
      duelWins,
      weeklyRank,
      completedSession: session,
    }, now);
    const leveledUp = level > levelBefore;
    if (leveledUp) createNotification(userId, 'level_up', 'Level up!', `You reached Level ${level}.`, now);
    if (goalJustCompleted) createNotification(userId, 'daily_goal', 'Daily goal complete', `You earned ${DAILY_GOAL_BONUS_XP} bonus XP.`, now);
    if ([3, 7, 14, 30].includes(currentStreak) && account.last_active_date !== today) createNotification(userId, 'streak', 'Streak milestone', `${currentStreak}-day focus streak!`, now);
    for (const achievement of achievementsUnlocked) createNotification(userId, 'achievement', 'Achievement unlocked', `${achievement.icon} ${achievement.name}`, now);
    if (session.groupId) {
      if (durationSeconds >= ACTIVITY_MINIMUM_SECONDS) logActivity(session.groupId, userId, 'mission', 'Mission complete', `Completed a ${Math.floor(durationSeconds / 60)} minute focus mission.`, now);
      if (goalJustCompleted) logActivity(session.groupId, userId, 'daily_goal', 'Daily goal complete', 'Completed their daily focus goal.', now);
      if (leveledUp) logActivity(session.groupId, userId, 'level_up', 'Level up!', `Reached Level ${level}.`, now);
      for (const achievement of achievementsUnlocked) logActivity(session.groupId, userId, 'achievement', 'Achievement unlocked', `${achievement.icon} ${achievement.name}`, now);
    }
    resolveExpiredDuels(now);
    const progression = progressionForXp(xp);
    return {
      session,
      totals: { todaySeconds: totals.todaySeconds, totalSeconds: totals.totalSeconds },
      xpAwarded: Math.floor(durationSeconds / 60) + (goalJustCompleted ? DAILY_GOAL_BONUS_XP : 0), xp,
      ...progression, leveledUp, ...(leveledUp ? { newLevel: level } : {}),
      streak: { current: currentStreak, longest: longestStreak },
      ...(account.daily_goal_minutes ? { dailyGoal: { goalMinutes: account.daily_goal_minutes, todayMinutes, justCompleted: goalJustCompleted } } : {}),
      achievementsUnlocked,
    };
  });
  return work();
}

export function abandonSession(id: string, userId: string): FocusSession {
  const current = sessionForUser(id, userId);
  if (current.status !== 'active') throw new ApiError(409, 'SESSION_NOT_ACTIVE', 'Only an active focus session can be abandoned.');
  const completedAt = new Date().toISOString();
  db.prepare('UPDATE focus_sessions SET duration_seconds = 0, completed_at = ?, status = ? WHERE id = ?')
    .run(completedAt, 'abandoned', id);
  return toSession({ ...current, duration_seconds: 0, completed_at: completedAt, status: 'abandoned' });
}

export function listSessions(userId: string, range: 'today' | 'week', now = new Date()): FocusSession[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - 6);
  const rows = db.prepare(`SELECT * FROM focus_sessions
    WHERE user_id = ? AND status = 'completed' AND completed_at >= ? ORDER BY completed_at DESC`)
    .all(userId, start.toISOString()) as SessionRow[];
  return rows.map(toSession);
}

export function timeRangeStart(range: 'today' | 'week' | 'month' | 'all_time', now = new Date()): Date {
  if (range === 'all_time') return new Date(0);
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - 6);
  if (range === 'month') start.setDate(1);
  return start;
}

export function getTotals(userId: string, now = new Date()): { todaySeconds: number; weekSeconds: number; totalSeconds: number; currentStreakDays: number } {
  const sum = (since?: Date): number => {
    const sql = `SELECT COALESCE(SUM(duration_seconds), 0) as seconds FROM focus_sessions WHERE user_id = ? AND status = 'completed'${since ? ' AND completed_at >= ?' : ''}`;
    const row = (since ? db.prepare(sql).get(userId, since.toISOString()) : db.prepare(sql).get(userId)) as { seconds: number };
    return row.seconds;
  };
  return { todaySeconds: sum(timeRangeStart('today', now)), weekSeconds: sum(timeRangeStart('week', now)), totalSeconds: sum(), currentStreakDays: calculateStreak(userId, now) };
}

export function calculateStreak(userId: string, now = new Date()): number {
  const rows = db.prepare(`SELECT completed_at FROM focus_sessions
    WHERE user_id = ? AND status = 'completed' AND duration_seconds > 0`).all(userId) as Array<{ completed_at: string }>;
  const completedDays = new Set(rows.map((row) => utcDay(new Date(row.completed_at))));
  let streak = 0;
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  while (completedDays.has(utcDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function calculateLongestStreak(userId: string): number {
  const rows = db.prepare(`SELECT DISTINCT substr(completed_at, 1, 10) as day FROM focus_sessions
    WHERE user_id = ? AND status = 'completed' AND duration_seconds > 0 ORDER BY day ASC`).all(userId) as Array<{ day: string }>;
  let longest = 0; let run = 0; let previous: Date | null = null;
  for (const row of rows) {
    const current = new Date(`${row.day}T00:00:00.000Z`);
    if (previous && current.getTime() - previous.getTime() === 24 * 60 * 60 * 1000) run += 1;
    else run = 1;
    longest = Math.max(longest, run); previous = current;
  }
  return longest;
}

export function sessionTotals(userId: string): { todaySeconds: number; totalSeconds: number } {
  const totals = getTotals(userId);
  return { todaySeconds: totals.todaySeconds, totalSeconds: totals.totalSeconds };
}

/** Repairs the additive MVP 2 caches from immutable session/reward records. */
export function reconcileProgressCaches(now = new Date()): void {
  const users = db.prepare('SELECT id, longest_streak FROM users').all() as Array<{ id: string; longest_streak: number }>;
  const update = db.prepare('UPDATE users SET xp = ?, current_streak = ?, longest_streak = ?, last_active_date = ? WHERE id = ?');
  for (const user of users) {
    const latest = db.prepare("SELECT substr(completed_at, 1, 10) as day FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND duration_seconds > 0 ORDER BY completed_at DESC LIMIT 1").get(user.id) as { day: string } | undefined;
    update.run(rawXpForUser(user.id), calculateStreak(user.id, now), Math.max(user.longest_streak, calculateLongestStreak(user.id)), latest?.day ?? null, user.id);
  }
}
