import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { achievementDefinitions, requirementMet, type AchievementContext } from '../src/services/achievements.js';
import { levelForXp, thresholdForLevel, xpForNextLevel, xpIntoLevel } from '../src/services/progression.js';
import type { FocusSession } from '../src/types.js';

let app: Express;
let db: import('better-sqlite3').Database;
let clearDatabase: () => void;

beforeAll(async () => {
  const appModule = await import('../src/app.js');
  const dbModule = await import('../src/db/db.js');
  app = appModule.createApp(); db = dbModule.db; clearDatabase = dbModule.clearDatabase;
});
beforeEach(() => clearDatabase());

const headers = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });
async function register(username: string): Promise<{ id: string; token: string }> {
  const response = await request(app).post('/api/auth/register').send({ username, email: `${username}@mvp2.test`, password: 'correct-horse-battery' }).expect(201);
  return { id: response.body.user.id as string, token: response.body.token as string };
}
function addCompleted(userId: string, groupId: string | null, seconds: number, completedAt: Date): void {
  db.prepare(`INSERT INTO focus_sessions (id, user_id, group_id, subject, duration_seconds, planned_duration_seconds, started_at, completed_at, status)
    VALUES (?, ?, ?, 'DSA', ?, ?, ?, ?, 'completed')`).run(randomUUID(), userId, groupId, seconds, seconds, completedAt.toISOString(), completedAt.toISOString());
}
async function startAndComplete(token: string, secondsAgo: number, plannedDurationSeconds = 60, groupId?: string): Promise<request.Response> {
  const started = await request(app).post('/api/sessions/start').set(headers(token)).send({ plannedDurationSeconds, groupId }).expect(201);
  db.prepare('UPDATE focus_sessions SET started_at = ? WHERE id = ?').run(new Date(Date.now() - secondsAgo * 1000).toISOString(), started.body.session.id);
  return request(app).post(`/api/sessions/${started.body.session.id}/complete`).set(headers(token)).send({}).expect(200);
}

describe('progression math', () => {
  it('matches the specified cumulative level thresholds', () => {
    expect([1, 2, 3, 4].map(thresholdForLevel)).toEqual([0, 100, 250, 450]);
    expect(levelForXp(0)).toBe(1); expect(levelForXp(99)).toBe(1); expect(levelForXp(100)).toBe(2); expect(levelForXp(250)).toBe(3);
    expect(xpIntoLevel(251)).toBe(1); expect(xpForNextLevel(251)).toBe(200);
  });
});

describe('completion rewards and daily goals', () => {
  it('awards only validated completed focus minutes and never awards abandoned/zero-duration sessions', async () => {
    const user = await register('rewards');
    const zero = await startAndComplete(user.token, 0); expect(zero.body.xpAwarded).toBe(0); expect(zero.body.xp).toBe(0);
    const active = await request(app).post('/api/sessions/start').set(headers(user.token)).send({ plannedDurationSeconds: 60 }).expect(201);
    await request(app).post(`/api/sessions/${active.body.session.id}/abandon`).set(headers(user.token)).send({}).expect(200);
    const awarded = await startAndComplete(user.token, 600); expect(awarded.body.session.durationSeconds).toBe(68); expect(awarded.body.xpAwarded).toBe(1); expect(awarded.body.xp).toBe(1);
    await request(app).post(`/api/sessions/${active.body.session.id}/complete`).set(headers(user.token)).send({}).expect(409);
  });

  it('awards the daily goal bonus once and sends the goal notification', async () => {
    const user = await register('goalkeeper');
    await request(app).patch('/api/users/me/daily-goal').set(headers(user.token)).send({ minutes: 1 }).expect(200);
    const first = await startAndComplete(user.token, 600); expect(first.body.dailyGoal).toMatchObject({ goalMinutes: 1, justCompleted: true }); expect(first.body.xp).toBe(51);
    const second = await startAndComplete(user.token, 600); expect(second.body.dailyGoal).toMatchObject({ justCompleted: false }); expect(second.body.xp).toBe(52);
    const notifications = await request(app).get('/api/notifications').set(headers(user.token)).expect(200);
    expect(notifications.body.notifications.filter((item: { type: string }) => item.type === 'daily_goal')).toHaveLength(1);
  });

  it('returns a level-up event in the same completion response when a threshold is crossed', async () => {
    const user = await register('levelup');
    const result = await startAndComplete(user.token, 6_100, 6_000);
    expect(result.body).toMatchObject({ xp: 100, level: 2, leveledUp: true, newLevel: 2, xpIntoLevel: 0, xpForNextLevel: 150 });
    const notifications = await request(app).get('/api/notifications').set(headers(user.token)).expect(200);
    expect(notifications.body.notifications.some((item: { type: string }) => item.type === 'level_up')).toBe(true);
  });

  it('updates cached UTC streaks and resets after a gap', async () => {
    const user = await register('streakcache'); const now = new Date();
    addCompleted(user.id, null, 600, new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const current = await startAndComplete(user.token, 600); expect(current.body.streak.current).toBe(2); expect(current.body.streak.longest).toBe(2);
    const resetUser = await register('resetcache');
    addCompleted(resetUser.id, null, 600, new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000));
    const reset = await startAndComplete(resetUser.token, 600); expect(reset.body.streak).toMatchObject({ current: 1, longest: 1 });
  });
});

describe('achievement predicates', () => {
  const baseSession: FocusSession = { id: 's', userId: 'u', groupId: null, subject: null, durationSeconds: 60, plannedDurationSeconds: 60, startedAt: '2026-09-15T12:00:00', completedAt: '2026-09-15T12:01:00', status: 'completed' };
  const base: AchievementContext = { completedSessions: 0, totalSeconds: 0, sessionsToday: 0, currentStreak: 0, duelWins: 0, weeklyRank: 2, completedSession: baseSession };
  it('has a positive and false-positive guard for every requirement type', () => {
    for (const achievement of achievementDefinitions()) {
      expect(requirementMet(achievement, base), `false case: ${achievement.id}`).toBe(false);
      let context: AchievementContext = { ...base };
      if (achievement.requirementType === 'first_session') context = { ...context, completedSessions: achievement.requirementValue };
      if (achievement.requirementType === 'total_minutes') context = { ...context, totalSeconds: achievement.requirementValue * 60 };
      if (achievement.requirementType === 'sessions_in_one_day') context = { ...context, sessionsToday: achievement.requirementValue };
      if (achievement.requirementType === 'total_hours') context = { ...context, totalSeconds: achievement.requirementValue * 3600 };
      if (achievement.requirementType === 'streak_days') context = { ...context, currentStreak: achievement.requirementValue };
      if (achievement.requirementType === 'duel_win') context = { ...context, duelWins: achievement.requirementValue };
      if (achievement.requirementType === 'group_weekly_rank_1') context = { ...context, weeklyRank: 1 };
      if (achievement.requirementType === 'session_before_time') context = { ...context, completedSession: { ...baseSession, startedAt: '2026-09-15T06:30:00' } };
      if (achievement.requirementType === 'session_after_time') context = { ...context, completedSession: { ...baseSession, startedAt: '2026-09-15T23:30:00' } };
      expect(requirementMet(achievement, context), `positive case: ${achievement.id}`).toBe(true);
    }
  });
});

describe('competition, leaderboard, activity, duels, and notifications', () => {
  it('returns XP/level over all leaderboard ranges and writes group mission activity', async () => {
    const owner = await register('boardowner'); const member = await register('boardmember');
    const group = await request(app).post('/api/groups').set(headers(owner.token)).send({ name: 'Competition' }).expect(201);
    await request(app).post('/api/groups/join').set(headers(member.token)).send({ inviteCode: group.body.group.inviteCode }).expect(200);
    await startAndComplete(owner.token, 2_000, 1_800, group.body.group.id);
    for (const range of ['today', 'week', 'month', 'all_time']) {
      const board = await request(app).get(`/api/groups/${group.body.group.id}/leaderboard?range=${range}`).set(headers(owner.token)).expect(200);
      expect(board.body.entries[0]).toMatchObject({ userId: owner.id, rank: 1, xp: expect.any(Number), level: expect.any(Number) });
    }
    const activity = await request(app).get(`/api/groups/${group.body.group.id}/activity`).set(headers(member.token)).expect(200);
    expect(activity.body.events.some((event: { type: string }) => event.type === 'mission')).toBe(true);
  });

  it('settles an expired weekly battle with the real focus winner', async () => {
    const user = await register('battleuser'); const group = await request(app).post('/api/groups').set(headers(user.token)).send({ name: 'Battle Crew' }).expect(201);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000); const day = yesterday.toISOString().slice(0, 10);
    await request(app).post('/api/challenges').set(headers(user.token)).send({ groupId: group.body.group.id, title: 'Past Battle', startDate: day, endDate: day }).expect(201);
    addCompleted(user.id, group.body.group.id, 1800, yesterday);
    const battle = await request(app).get(`/api/groups/${group.body.group.id}/challenge`).set(headers(user.token)).expect(200);
    expect(battle.body.winnerId).toBe(user.id); expect(battle.body.endsInSeconds).toBe(0);
  });

  it('creates, accepts, and resolves a duel from session-derived focus time', async () => {
    const challenger = await register('challenger'); const opponent = await register('opponent');
    const group = await request(app).post('/api/groups').set(headers(challenger.token)).send({ name: 'Duel Crew' }).expect(201);
    await request(app).post('/api/groups/join').set(headers(opponent.token)).send({ inviteCode: group.body.group.inviteCode }).expect(200);
    const created = await request(app).post('/api/duels').set(headers(challenger.token)).send({ groupId: group.body.group.id, opponentId: opponent.id, type: '24h' }).expect(201);
    const accepted = await request(app).post(`/api/duels/${created.body.duel.id}/accept`).set(headers(opponent.token)).send({}).expect(200); expect(accepted.body.duel.status).toBe('active');
    const during = new Date(Date.now() - 36 * 60 * 60 * 1000);
    db.prepare("UPDATE duels SET start_date = ?, end_date = ? WHERE id = ?").run(new Date(during.getTime() - 60 * 60 * 1000).toISOString(), new Date(during.getTime() + 60 * 60 * 1000).toISOString(), created.body.duel.id);
    addCompleted(challenger.id, group.body.group.id, 1200, during); addCompleted(opponent.id, group.body.group.id, 600, during);
    const settled = await request(app).get(`/api/duels/${created.body.duel.id}`).set(headers(challenger.token)).expect(200);
    expect(settled.body.duel).toMatchObject({ status: 'completed', winnerId: challenger.id }); expect(settled.body.challengerSeconds).toBe(1200);
    const opponentNotifications = await request(app).get('/api/notifications').set(headers(opponent.token)).expect(200);
    expect(opponentNotifications.body.notifications.some((item: { type: string }) => item.type === 'duel_challenge')).toBe(true);
  });

  it('allows only the challenged member to decline a pending duel', async () => {
    const challenger = await register('declinerone'); const opponent = await register('declinertwo');
    const group = await request(app).post('/api/groups').set(headers(challenger.token)).send({ name: 'Decline Crew' }).expect(201);
    await request(app).post('/api/groups/join').set(headers(opponent.token)).send({ inviteCode: group.body.group.inviteCode }).expect(200);
    const created = await request(app).post('/api/duels').set(headers(challenger.token)).send({ groupId: group.body.group.id, opponentId: opponent.id, type: 'week' }).expect(201);
    await request(app).post(`/api/duels/${created.body.duel.id}/decline`).set(headers(challenger.token)).send({}).expect(409);
    const declined = await request(app).post(`/api/duels/${created.body.duel.id}/decline`).set(headers(opponent.token)).send({}).expect(200);
    expect(declined.body.duel.status).toBe('declined');
  });
});
