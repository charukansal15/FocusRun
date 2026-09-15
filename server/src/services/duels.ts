import { db } from '../db/db.js';
import { ApiError } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import type { Duel, DuelStatus, DuelType, DuelView } from '../types.js';
import { requireGroupMembership } from './groups.js';
import { logActivity } from './activity.js';
import { createNotification } from './notifications.js';
import { unlockDuelWinAchievement } from './achievements.js';

type DuelRow = { id: string; group_id: string; challenger_id: string; opponent_id: string; type: DuelType; start_date: string; end_date: string; status: DuelStatus; winner_id: string | null };
const toDuel = (row: DuelRow): Duel => ({ id: row.id, groupId: row.group_id, challengerId: row.challenger_id, opponentId: row.opponent_id, type: row.type, startDate: row.start_date, endDate: row.end_date, status: row.status, winnerId: row.winner_id });

function requireDuel(id: string): DuelRow {
  const row = db.prepare('SELECT * FROM duels WHERE id = ?').get(id) as DuelRow | undefined;
  if (!row) throw new ApiError(404, 'DUEL_NOT_FOUND', 'Duel not found.');
  return row;
}

export function duelSeconds(duel: Duel): { challengerSeconds: number; opponentSeconds: number } {
  const total = (userId: string): number => (db.prepare(`SELECT COALESCE(SUM(duration_seconds), 0) as seconds FROM focus_sessions
    WHERE user_id = ? AND group_id = ? AND status = 'completed' AND completed_at >= ? AND completed_at <= ?`).get(userId, duel.groupId, duel.startDate, duel.endDate) as { seconds: number }).seconds;
  return { challengerSeconds: total(duel.challengerId), opponentSeconds: total(duel.opponentId) };
}

function usernameFor(id: string): string {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined;
  return row?.username ?? 'Unknown';
}

export function toDuelView(duel: Duel, now = new Date()): DuelView {
  const scores = duel.status === 'active' || duel.status === 'completed' ? duelSeconds(duel) : { challengerSeconds: 0, opponentSeconds: 0 };
  const remaining = Math.max(0, Math.floor((new Date(duel.endDate).getTime() - now.getTime()) / 1000));
  return {
    ...duel, ...scores,
    challengerUsername: usernameFor(duel.challengerId), opponentUsername: usernameFor(duel.opponentId),
    endsInSeconds: duel.status === 'active' ? remaining : 0,
    winnerUsername: duel.winnerId ? usernameFor(duel.winnerId) : null,
  };
}

export function createDuel(userId: string, groupId: string, opponentId: string, type: DuelType, now = new Date()): DuelView {
  requireGroupMembership(groupId, userId); requireGroupMembership(groupId, opponentId);
  if (userId === opponentId) throw new ApiError(400, 'VALIDATION_ERROR', 'You cannot challenge yourself.');
  const exists = db.prepare(`SELECT 1 FROM duels WHERE group_id = ? AND status IN ('pending', 'accepted', 'active')
    AND ((challenger_id = ? AND opponent_id = ?) OR (challenger_id = ? AND opponent_id = ?))`).get(groupId, userId, opponentId, opponentId, userId);
  if (exists) throw new ApiError(409, 'DUEL_EXISTS', 'There is already an open duel between these members.');
  const nowIso = now.toISOString();
  const duel: Duel = { id: createId(), groupId, challengerId: userId, opponentId, type, startDate: nowIso, endDate: nowIso, status: 'pending', winnerId: null };
  db.prepare('INSERT INTO duels (id, group_id, challenger_id, opponent_id, type, start_date, end_date, status, winner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(duel.id, duel.groupId, duel.challengerId, duel.opponentId, duel.type, duel.startDate, duel.endDate, duel.status, null);
  createNotification(opponentId, 'duel_challenge', 'New duel challenge', 'A group member challenged you to a focus duel.', now);
  return toDuelView(duel, now);
}

export function acceptDuel(id: string, userId: string, now = new Date()): DuelView {
  const row = requireDuel(id);
  if (row.opponent_id !== userId || row.status !== 'pending') throw new ApiError(409, 'DUEL_NOT_ACTIONABLE', 'This duel cannot be accepted.');
  const end = new Date(now);
  end.setTime(end.getTime() + (row.type === '24h' ? 24 : 7 * 24) * 60 * 60 * 1000);
  db.prepare("UPDATE duels SET status = 'active', start_date = ?, end_date = ? WHERE id = ?").run(now.toISOString(), end.toISOString(), id);
  return toDuelView(toDuel({ ...row, status: 'active', start_date: now.toISOString(), end_date: end.toISOString() }), now);
}

export function declineDuel(id: string, userId: string, now = new Date()): DuelView {
  const row = requireDuel(id);
  if (row.opponent_id !== userId || row.status !== 'pending') throw new ApiError(409, 'DUEL_NOT_ACTIONABLE', 'This duel cannot be declined.');
  db.prepare("UPDATE duels SET status = 'declined' WHERE id = ?").run(id);
  return toDuelView(toDuel({ ...row, status: 'declined' }), now);
}

export function resolveExpiredDuels(now = new Date()): Duel[] {
  const rows = db.prepare("SELECT * FROM duels WHERE status = 'active' AND end_date <= ?").all(now.toISOString()) as DuelRow[];
  const completed: Duel[] = [];
  for (const row of rows) {
    const duel = toDuel(row); const totals = duelSeconds(duel);
    const winnerId = totals.challengerSeconds === totals.opponentSeconds ? null : totals.challengerSeconds > totals.opponentSeconds ? duel.challengerId : duel.opponentId;
    db.prepare("UPDATE duels SET status = 'completed', winner_id = ? WHERE id = ?").run(winnerId, duel.id);
    const final = { ...duel, status: 'completed' as const, winnerId };
    const message = winnerId ? 'A focus duel has a winner.' : 'A focus duel ended in a tie.';
    logActivity(duel.groupId, winnerId ?? duel.challengerId, 'duel_result', 'Duel complete', message, now);
    createNotification(duel.challengerId, 'duel_challenge', 'Duel complete', message, now);
    createNotification(duel.opponentId, 'duel_challenge', 'Duel complete', message, now);
    if (winnerId) {
      const achievements = unlockDuelWinAchievement(winnerId, now);
      for (const achievement of achievements) createNotification(winnerId, 'achievement', 'Achievement unlocked', `${achievement.icon} ${achievement.name}`, now);
    }
    completed.push(final);
  }
  return completed;
}

export function getDuel(id: string, userId: string, now = new Date()): { duel: DuelView; challengerSeconds: number; opponentSeconds: number; endsInSeconds: number; challengerUsername: string; opponentUsername: string; winnerUsername: string | null } {
  resolveExpiredDuels(now); const duel = toDuelView(toDuel(requireDuel(id)), now);
  if (duel.challengerId !== userId && duel.opponentId !== userId) throw new ApiError(404, 'DUEL_NOT_FOUND', 'Duel not found.');
  return { duel, challengerSeconds: duel.challengerSeconds, opponentSeconds: duel.opponentSeconds, endsInSeconds: duel.endsInSeconds, challengerUsername: duel.challengerUsername, opponentUsername: duel.opponentUsername, winnerUsername: duel.winnerUsername };
}

export function listDuels(userId: string, status?: 'active' | 'completed' | 'open', now = new Date()): DuelView[] {
  resolveExpiredDuels(now);
  const filter = status === 'open' ? " AND status IN ('pending', 'active')" : status ? ' AND status = ?' : '';
  const params = status && status !== 'open' ? [userId, userId, status] : [userId, userId];
  const rows = db.prepare(`SELECT * FROM duels WHERE (challenger_id = ? OR opponent_id = ?)${filter} ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, end_date DESC LIMIT 30`)
    .all(...params) as DuelRow[];
  return rows.map((row) => toDuelView(toDuel(row), now));
}
