import { query } from '../db/query.js';
import type { Theme, User } from '../types.js';

type UserRow = {
  id: string;
  username: string;
  email: string;
  preferred_theme: Theme;
  xp: number;
  current_streak: number;
  longest_streak: number;
  daily_goal_minutes: number | null;
  last_active_date: string | null;
  created_at: string;
};

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    preferredTheme: row.preferred_theme,
    xp: row.xp,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    dailyGoalMinutes: row.daily_goal_minutes,
    lastActiveDate: row.last_active_date,
    createdAt: row.created_at,
  };
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await query<UserRow>(
    `SELECT id, username, email, preferred_theme, xp, current_streak,
            longest_streak, daily_goal_minutes, last_active_date, created_at
     FROM users
     WHERE id = $1`,
    [id],
  );

  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateUserTheme(id: string, theme: Theme): Promise<User | null> {
  await query(
    `UPDATE users
     SET preferred_theme = $1
     WHERE id = $2`,
    [theme, id],
  );

  return findUserById(id);
}

export async function updateDailyGoal(id: string, minutes: number | null): Promise<User | null> {
  await query(
    `UPDATE users
     SET daily_goal_minutes = $1
     WHERE id = $2`,
    [minutes, id],
  );

  return findUserById(id);
}
