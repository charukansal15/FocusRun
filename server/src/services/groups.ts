import { db } from '../db/db.js';
import { ApiError } from '../lib/errors.js';
import { createId, createInviteCode } from '../lib/ids.js';
import type { Group, User } from '../types.js';
import { toUser } from './users.js';

type GroupRow = { id: string; name: string; invite_code: string; created_by: string; created_at: string };

function toGroup(row: GroupRow): Group {
  return { id: row.id, name: row.name, inviteCode: row.invite_code, createdBy: row.created_by, createdAt: row.created_at };
}

function nextInviteCode(): string {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const code = createInviteCode();
    if (!db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code)) return code;
  }
  throw new ApiError(500, 'INVITE_CODE_FAILED', 'Unable to create an invite code. Please try again.');
}

export function createGroup(userId: string, name: string): Group {
  const now = new Date().toISOString();
  const group: Group = { id: createId(), name, inviteCode: nextInviteCode(), createdBy: userId, createdAt: now };
  const create = db.transaction(() => {
    db.prepare('INSERT INTO groups (id, name, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(group.id, group.name, group.inviteCode, group.createdBy, group.createdAt);
    db.prepare('INSERT INTO group_members (id, group_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
      .run(createId(), group.id, userId, now);
  });
  create();
  return group;
}

export function joinGroup(userId: string, inviteCode: string): Group {
  const row = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(inviteCode.toUpperCase()) as GroupRow | undefined;
  if (!row) throw new ApiError(404, 'INVALID_INVITE_CODE', 'That invite code does not match a group.');
  db.prepare('INSERT OR IGNORE INTO group_members (id, group_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
    .run(createId(), row.id, userId, new Date().toISOString());
  return toGroup(row);
}

export function listGroups(userId: string): Group[] {
  const rows = db.prepare(`
    SELECT g.* FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ? ORDER BY g.created_at DESC
  `).all(userId) as GroupRow[];
  return rows.map(toGroup);
}

export function requireGroupMembership(groupId: string, userId: string): Group {
  const row = db.prepare(`
    SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id = g.id
    WHERE g.id = ? AND gm.user_id = ?
  `).get(groupId, userId) as GroupRow | undefined;
  if (!row) throw new ApiError(404, 'GROUP_NOT_FOUND', 'Group not found or you are not a member.');
  return toGroup(row);
}

export function getGroupWithMembers(groupId: string, userId: string): { group: Group; members: User[] } {
  const group = requireGroupMembership(groupId, userId);
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.preferred_theme, u.xp, u.current_streak, u.longest_streak, u.daily_goal_minutes, u.last_active_date, u.created_at
    FROM users u JOIN group_members gm ON gm.user_id = u.id
    WHERE gm.group_id = ? ORDER BY lower(u.username), u.id
  `).all(groupId) as Array<{ id: string; username: string; email: string; preferred_theme: User['preferredTheme']; xp: number; current_streak: number; longest_streak: number; daily_goal_minutes: number | null; last_active_date: string | null; created_at: string }>;
  return { group, members: rows.map(toUser) };
}
