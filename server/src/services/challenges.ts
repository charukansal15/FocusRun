import { db } from '../db/db.js';
import { ApiError } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import type { Challenge } from '../types.js';
import { requireGroupMembership } from './groups.js';
import { leaderboardForDates } from './leaderboard.js';
import { refreshCachedXp } from './sessions.js';

type ChallengeRow = { id: string; group_id: string; title: string; description: string | null; start_date: string; end_date: string; winner_id: string | null; bonus_awarded: number };

function toChallenge(row: ChallengeRow): Challenge {
  return { id: row.id, groupId: row.group_id, title: row.title, description: row.description, startDate: row.start_date, endDate: row.end_date };
}

function usernameFor(id: string | null): string | null {
  if (!id) return null;
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined;
  return row?.username ?? null;
}

function settleChallenge(row: ChallengeRow, now: Date): ChallengeRow {
  const endInstant = new Date(`${row.end_date}T23:59:59.999Z`);
  let settled = row;
  if (endInstant <= now && !settled.winner_id) {
    const finalStandings = leaderboardForDates(settled.group_id, settled.start_date, settled.end_date);
    const winnerId = finalStandings[0]?.totalSeconds ? finalStandings[0].userId : null;
    db.prepare('UPDATE challenges SET winner_id = ? WHERE id = ?').run(winnerId, settled.id);
    settled = { ...settled, winner_id: winnerId };
  }
  if (endInstant <= now && settled.winner_id && !settled.bonus_awarded) {
    db.prepare('UPDATE challenges SET bonus_awarded = 1 WHERE id = ?').run(settled.id);
    settled = { ...settled, bonus_awarded: 1 };
   if (settled.winner_id) {
  refreshCachedXp(settled.winner_id);
}
  }
  return settled;
}

export function createChallenge(userId: string, groupId: string, title: string, description: string | null, startDate: string, endDate: string): Challenge {
  requireGroupMembership(groupId, userId);
  if (startDate > endDate) throw new ApiError(400, 'VALIDATION_ERROR', 'The challenge end date must be after its start date.');
  const overlapping = db.prepare('SELECT 1 FROM challenges WHERE group_id = ? AND end_date >= ? AND start_date <= ?').get(groupId, startDate, endDate);
  if (overlapping) throw new ApiError(409, 'ACTIVE_CHALLENGE_EXISTS', 'This group already has a challenge during those dates.');
  const challenge: Challenge = { id: createId(), groupId, title, description, startDate, endDate };
  db.prepare('INSERT INTO challenges (id, group_id, title, description, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(challenge.id, challenge.groupId, challenge.title, challenge.description, challenge.startDate, challenge.endDate);
  return challenge;
}

export function getActiveChallenge(userId: string, groupId: string, now = new Date()): { challenge: Challenge | null; standings: ReturnType<typeof leaderboardForDates>; endsInSeconds: number; winnerId?: string; winnerUsername?: string | null; bonusAwarded?: boolean } {
  requireGroupMembership(groupId, userId);
  const today = now.toISOString().slice(0, 10);
  const found = db.prepare(`SELECT * FROM challenges WHERE group_id = ? AND start_date <= ? ORDER BY end_date DESC LIMIT 1`)
    .get(groupId, today) as ChallengeRow | undefined;
  if (!found) return { challenge: null, standings: [], endsInSeconds: 0 };
  const row = settleChallenge(found, now);
  const endInstant = new Date(`${row.end_date}T23:59:59.999Z`);
  const challenge = toChallenge(row);
  return { challenge, standings: leaderboardForDates(groupId, challenge.startDate, challenge.endDate), endsInSeconds: Math.max(0, Math.floor((endInstant.getTime() - now.getTime()) / 1000)), ...(row.winner_id ? { winnerId: row.winner_id, winnerUsername: usernameFor(row.winner_id), bonusAwarded: Boolean(row.bonus_awarded) } : {}) };
}
