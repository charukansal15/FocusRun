import { db } from '../db/db.js';
import { createId } from '../lib/ids.js';
import type { Notification, NotificationType } from '../types.js';

type NotificationRow = { id: string; user_id: string; type: NotificationType; title: string; message: string; read: number; created_at: string };
const toNotification = (row: NotificationRow): Notification => ({ id: row.id, userId: row.user_id, type: row.type, title: row.title, message: row.message, read: Boolean(row.read), createdAt: row.created_at });

export function createNotification(userId: string, type: NotificationType, title: string, message: string, now = new Date()): Notification {
  const notification: Notification = { id: createId(), userId, type, title, message, read: false, createdAt: now.toISOString() };
  db.prepare('INSERT INTO notifications (id, user_id, type, title, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(notification.id, notification.userId, notification.type, notification.title, notification.message, 0, notification.createdAt);
  return notification;
}

export function listNotifications(userId: string, unreadOnly: boolean): Notification[] {
  const rows = db.prepare(`SELECT * FROM notifications WHERE user_id = ?${unreadOnly ? ' AND read = 0' : ''} ORDER BY created_at DESC LIMIT 30`).all(userId) as NotificationRow[];
  return rows.map(toNotification);
}

export function markNotificationRead(userId: string, id: string): boolean {
  return db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function markAllNotificationsRead(userId: string): void { db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId); }
