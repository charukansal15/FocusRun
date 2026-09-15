import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

let app: Express;
let db: import('better-sqlite3').Database;
let clearDatabase: () => void;

beforeAll(async () => {
  const appModule = await import('../src/app.js');
  const dbModule = await import('../src/db/db.js');
  app = appModule.createApp();
  db = dbModule.db;
  clearDatabase = dbModule.clearDatabase;
});

beforeEach(() => clearDatabase());

async function register(username: string, email = `${username}@focus.test`): Promise<{ id: string; token: string }> {
  const response = await request(app).post('/api/auth/register').send({ username, email, password: 'correct-horse-battery' }).expect(201);
  return { id: response.body.user.id as string, token: response.body.token as string };
}

function bearer(token: string): Record<string, string> { return { Authorization: `Bearer ${token}` }; }

function addCompleted(userId: string, groupId: string | null, seconds: number, completedAt: Date): void {
  db.prepare(`INSERT INTO focus_sessions (id, user_id, group_id, subject, duration_seconds, planned_duration_seconds, started_at, completed_at, status)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'completed')`).run(randomUUID(), userId, groupId, seconds, 60, completedAt.toISOString(), completedAt.toISOString());
}

describe('authentication', () => {
  it('registers, logs in, persists through /me, and rejects duplicates', async () => {
    const created = await request(app).post('/api/auth/register').send({ username: 'orbit', email: 'orbit@example.test', password: 'correct-horse-battery' }).expect(201);
    expect(created.body.user.username).toBe('orbit');
    await request(app).get('/api/auth/me').set(bearer(created.body.token)).expect(200).expect(({ body }) => expect(body.user.email).toBe('orbit@example.test'));
    await request(app).post('/api/auth/register').send({ username: 'second', email: 'orbit@example.test', password: 'correct-horse-battery' }).expect(409);
    await request(app).post('/api/auth/register').send({ username: 'orbit', email: 'another@example.test', password: 'correct-horse-battery' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: 'orbit@example.test', password: 'correct-horse-battery' }).expect(200);
  });

  it('uses the same generic response for unknown email and wrong password', async () => {
    await register('secure');
    const unknown = await request(app).post('/api/auth/login').send({ email: 'missing@example.test', password: 'wrong-pass' }).expect(401);
    const wrong = await request(app).post('/api/auth/login').send({ email: 'secure@focus.test', password: 'wrong-pass' }).expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });
});

describe('groups', () => {
  it('creates a group, joins it only once, and rejects an invalid invite', async () => {
    const owner = await register('owner'); const member = await register('member');
    const created = await request(app).post('/api/groups').set(bearer(owner.token)).send({ name: 'Quiet Crew' }).expect(201);
    expect(created.body.group.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    const code = created.body.group.inviteCode as string;
    await request(app).post('/api/groups/join').set(bearer(member.token)).send({ inviteCode: code }).expect(200);
    await request(app).post('/api/groups/join').set(bearer(member.token)).send({ inviteCode: code }).expect(200);
    const detail = await request(app).get(`/api/groups/${created.body.group.id}`).set(bearer(member.token)).expect(200);
    expect(detail.body.members).toHaveLength(2);
    await request(app).post('/api/groups/join').set(bearer(member.token)).send({ inviteCode: 'ZZZZZZ' }).expect(404);
  });
});

describe('focus sessions', () => {
  it('starts a session and records server-calculated duration on completion', async () => {
    const user = await register('timer');
    const started = await request(app).post('/api/sessions/start').set(bearer(user.token)).send({ subject: 'DSA', plannedDurationSeconds: 60 }).expect(201);
    expect(started.body.session.status).toBe('active');
    db.prepare('UPDATE focus_sessions SET started_at = ? WHERE id = ?').run(new Date(Date.now() - 32_000).toISOString(), started.body.session.id);
    const completed = await request(app).post(`/api/sessions/${started.body.session.id}/complete`).set(bearer(user.token)).send({}).expect(200);
    expect(completed.body.session.status).toBe('completed');
    expect(completed.body.session.durationSeconds).toBeGreaterThanOrEqual(31);
    expect(completed.body.session.durationSeconds).toBeLessThanOrEqual(33);
  });

  it('clips an inflated elapsed duration to planned duration plus grace', async () => {
    const user = await register('clipper');
    const started = await request(app).post('/api/sessions/start').set(bearer(user.token)).send({ plannedDurationSeconds: 60 }).expect(201);
    db.prepare('UPDATE focus_sessions SET started_at = ? WHERE id = ?').run(new Date(Date.now() - 10 * 60_000).toISOString(), started.body.session.id);
    const completed = await request(app).post(`/api/sessions/${started.body.session.id}/complete`).set(bearer(user.token)).send({}).expect(200);
    expect(completed.body.session.durationSeconds).toBe(68);
  });
});

describe('leaderboard and streaks', () => {
  it('orders tied focus time deterministically by username', async () => {
    const zed = await register('zed'); const amy = await register('amy');
    const group = await request(app).post('/api/groups').set(bearer(zed.token)).send({ name: 'Ranked' }).expect(201);
    await request(app).post('/api/groups/join').set(bearer(amy.token)).send({ inviteCode: group.body.group.inviteCode }).expect(200);
    addCompleted(zed.id, group.body.group.id, 1800, new Date()); addCompleted(amy.id, group.body.group.id, 1800, new Date());
    const board = await request(app).get(`/api/groups/${group.body.group.id}/leaderboard?range=today`).set(bearer(zed.token)).expect(200);
    expect(board.body.entries.map((entry: { username: string }) => entry.username)).toEqual(['amy', 'zed']);
    expect(board.body.entries.map((entry: { rank: number }) => entry.rank)).toEqual([1, 2]);
  });

  it('calculates a consecutive-day streak from completed sessions', async () => {
    const user = await register('streak'); const now = new Date();
    for (let daysAgo = 0; daysAgo < 3; daysAgo += 1) { const day = new Date(now); day.setDate(now.getDate() - daysAgo); addCompleted(user.id, null, 600, day); }
    const old = new Date(now); old.setDate(now.getDate() - 5); addCompleted(user.id, null, 600, old);
    const stats = await request(app).get('/api/stats').set(bearer(user.token)).expect(200);
    expect(stats.body.currentStreakDays).toBe(3);
  });
});
