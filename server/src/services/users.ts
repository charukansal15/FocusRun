import { db } from '../db/db.js';
import type { Theme, User } from '../types.js';

type UserRow = { id: string; username: string; email: string; preferred_theme: Theme; xp: number; current_streak: number; longest_streak: number; daily_goal_minutes: number | null; last_active_date: string | null; created_at: string };

export function toUser(row: UserRow): User {
  return { id: row.id, username: row.username, email: row.email, preferredTheme: row.preferred_theme, xp: row.xp, currentStreak: row.current_streak, longestStreak: row.longest_streak, dailyGoalMinutes: row.daily_goal_minutes, lastActiveDate: row.last_active_date, createdAt: row.created_at };
}

export function findUserById(id: string): User | null {
  const row = db.prepare('SELECT id, username, email, preferred_theme, xp, current_streak, longest_streak, daily_goal_minutes, last_active_date, created_at FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function updateUserTheme(id: string, theme: Theme): User | null {
  db.prepare('UPDATE users SET preferred_theme = ? WHERE id = ?').run(theme, id);
  return findUserById(id);
}

export function updateDailyGoal(id: string, minutes: number | null): User | null {
  db.prepare('UPDATE users SET daily_goal_minutes = ? WHERE id = ?').run(minutes, id);
  return findUserById(id);
}
