import { db } from '../db/db.js';
import { requireGroupMembership } from './groups.js';
import { timeRangeStart } from './sessions.js';
import { levelForXp } from './progression.js';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalSeconds: number;
  xp: number;
  level: number;
  rank: number;
}

export function groupLeaderboard(groupId: string, userId: string, range: 'today' | 'week' | 'month' | 'all_time', now = new Date()): LeaderboardEntry[] {
  requireGroupMembership(groupId, userId);
  const rows = db.prepare(`
    SELECT u.id as user_id, u.username, u.xp, COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.completed_at >= ? THEN s.duration_seconds ELSE 0 END), 0) as total_seconds
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN focus_sessions s ON s.user_id = u.id AND s.group_id = gm.group_id
    WHERE gm.group_id = ?
    GROUP BY u.id, u.username, u.xp
    ORDER BY total_seconds DESC, lower(u.username) ASC, u.id ASC
  `).all(timeRangeStart(range, now).toISOString(), groupId) as Array<{ user_id: string; username: string; xp: number; total_seconds: number }>;
  return rows.map((row, index) => ({ userId: row.user_id, username: row.username, totalSeconds: row.total_seconds, xp: row.xp, level: levelForXp(row.xp), rank: index + 1 }));
}

export function leaderboardForDates(groupId: string, startDate: string, endDate: string): Omit<LeaderboardEntry, 'rank'>[] {
  const start = `${startDate}T00:00:00.000Z`;
  const end = `${endDate}T23:59:59.999Z`;
  const rows = db.prepare(`
    SELECT u.id as user_id, u.username, u.xp, COALESCE(SUM(CASE WHEN s.status = 'completed' AND s.completed_at >= ? AND s.completed_at <= ? THEN s.duration_seconds ELSE 0 END), 0) as total_seconds
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN focus_sessions s ON s.user_id = u.id AND s.group_id = gm.group_id
    WHERE gm.group_id = ?
    GROUP BY u.id, u.username, u.xp
    ORDER BY total_seconds DESC, lower(u.username) ASC, u.id ASC
  `).all(start, end, groupId) as Array<{ user_id: string; username: string; xp: number; total_seconds: number }>;
  return rows.map((row) => ({ userId: row.user_id, username: row.username, totalSeconds: row.total_seconds, xp: row.xp, level: levelForXp(row.xp) }));
}
