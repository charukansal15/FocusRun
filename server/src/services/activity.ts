import { db } from '../db/db.js';
import { createId } from '../lib/ids.js';
import type { ActivityEvent } from '../types.js';

type ActivityRow = { id: string; group_id: string; user_id: string; username: string; type: string; title: string; message: string; created_at: string };
const toActivity = (row: ActivityRow): ActivityEvent => ({ id: row.id, groupId: row.group_id, userId: row.user_id, username: row.username, type: row.type, title: row.title, message: row.message, createdAt: row.created_at });

export function logActivity(groupId: string, userId: string, type: string, title: string, message: string, now = new Date()): void {
  db.prepare('INSERT INTO activity_log (id, group_id, user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(createId(), groupId, userId, type, title, message, now.toISOString());
}

export function groupActivity(groupId: string): ActivityEvent[] {
  const rows = db.prepare(`SELECT a.*, u.username FROM activity_log a JOIN users u ON u.id = a.user_id
    WHERE a.group_id = ? ORDER BY a.created_at DESC LIMIT 50`).all(groupId) as ActivityRow[];
  return rows.map(toActivity);
}
