import { db } from '../db/db.js';
import { createId } from '../lib/ids.js';
import type { Achievement, AchievementRequirement, FocusSession, UnlockedAchievement } from '../types.js';
import { EARLY_BIRD_HHMM, NIGHT_OWL_HHMM } from './progression.js';

const definitions: Achievement[] = [
  { id: 'first_focus', name: 'First Focus', description: 'Complete your first focus mission', icon: '🎯', requirementType: 'first_session', requirementValue: 1 },
  { id: 'hour_power', name: 'Hour Power', description: 'Complete 60 minutes of total focus', icon: '⚡', requirementType: 'total_minutes', requirementValue: 60 },
  { id: 'grind_mode', name: 'Grind Mode', description: 'Complete 5 focus missions in one calendar day', icon: '🔥', requirementType: 'sessions_in_one_day', requirementValue: 5 },
  { id: 'ten_hours', name: '10 Hours', description: 'Reach 10 total focus hours', icon: '🕙', requirementType: 'total_hours', requirementValue: 10 },
  { id: 'fifty_hours', name: '50 Hours', description: 'Reach 50 total focus hours', icon: '🏔️', requirementType: 'total_hours', requirementValue: 50 },
  { id: 'century', name: 'Century', description: 'Reach 100 total focus hours', icon: '💯', requirementType: 'total_hours', requirementValue: 100 },
  { id: 'streak_starter', name: 'Streak Starter', description: 'Maintain a 3-day streak', icon: '🌱', requirementType: 'streak_days', requirementValue: 3 },
  { id: 'week_warrior', name: 'Week Warrior', description: 'Maintain a 7-day streak', icon: '🛡️', requirementType: 'streak_days', requirementValue: 7 },
  { id: 'rival', name: 'Rival', description: 'Win a friend duel', icon: '⚔️', requirementType: 'duel_win', requirementValue: 1 },
  { id: 'champion', name: 'Champion', description: 'Finish #1 on a group weekly leaderboard', icon: '👑', requirementType: 'group_weekly_rank_1', requirementValue: 1 },
  { id: 'early_bird', name: 'Early Bird', description: 'Complete a mission started before 7:00 AM', icon: '🌅', requirementType: 'session_before_time', requirementValue: EARLY_BIRD_HHMM },
  { id: 'night_owl', name: 'Night Owl', description: 'Complete a mission started after 11:00 PM', icon: '🦉', requirementType: 'session_after_time', requirementValue: NIGHT_OWL_HHMM },
];

export interface AchievementContext {
  completedSessions: number;
  totalSeconds: number;
  sessionsToday: number;
  currentStreak: number;
  duelWins: number;
  weeklyRank: number | null;
  completedSession: FocusSession;
}

export function achievementDefinitions(): Achievement[] { return definitions; }

export function seedAchievements(): void {
  const insert = db.prepare('INSERT OR IGNORE INTO achievements (id, name, description, icon, requirement_type, requirement_value) VALUES (?, ?, ?, ?, ?, ?)');
  for (const item of definitions) insert.run(item.id, item.name, item.description, item.icon, item.requirementType, item.requirementValue);
}

export function requirementMet(achievement: Achievement, context: AchievementContext): boolean {
  const started = new Date(context.completedSession.startedAt);
  const hhmm = started.getHours() * 100 + started.getMinutes();
  const values: Record<AchievementRequirement, boolean> = {
    first_session: context.completedSessions >= achievement.requirementValue,
    total_minutes: Math.floor(context.totalSeconds / 60) >= achievement.requirementValue,
    sessions_in_one_day: context.sessionsToday >= achievement.requirementValue,
    total_hours: context.totalSeconds >= achievement.requirementValue * 3600,
    streak_days: context.currentStreak >= achievement.requirementValue,
    duel_win: context.duelWins >= achievement.requirementValue,
    group_weekly_rank_1: context.weeklyRank === 1,
    session_before_time: hhmm < achievement.requirementValue,
    session_after_time: hhmm >= achievement.requirementValue,
  };
  return values[achievement.requirementType];
}

export function unlockEligibleAchievements(userId: string, context: AchievementContext, now = new Date()): Achievement[] {
  const unlocked: Achievement[] = [];
  const hasAchievement = db.prepare('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?');
  const save = db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)');
  for (const achievement of definitions) {
    if (requirementMet(achievement, context) && !hasAchievement.get(userId, achievement.id)) {
      const result = save.run(userId, achievement.id, now.toISOString());
      if (result.changes) unlocked.push(achievement);
    }
  }
  return unlocked;
}

export function unlockedForUser(userId: string): UnlockedAchievement[] {
  const rows = db.prepare(`SELECT a.id, a.name, a.description, a.icon, a.requirement_type, a.requirement_value, ua.unlocked_at
    FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`).all(userId) as Array<{
    id: string; name: string; description: string; icon: string; requirement_type: AchievementRequirement; requirement_value: number; unlocked_at: string;
  }>;
  return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, icon: row.icon, requirementType: row.requirement_type, requirementValue: row.requirement_value, unlockedAt: row.unlocked_at }));
}

export function unlockDuelWinAchievement(userId: string, now = new Date()): Achievement[] {
  const fakeSession: FocusSession = { id: createId(), userId, groupId: null, subject: null, durationSeconds: 0, plannedDurationSeconds: 0, startedAt: now.toISOString(), completedAt: now.toISOString(), status: 'completed' };
  const wins = (db.prepare("SELECT COUNT(*) as count FROM duels WHERE winner_id = ? AND status = 'completed'").get(userId) as { count: number }).count;
  return unlockEligibleAchievements(userId, { completedSessions: 0, totalSeconds: 0, sessionsToday: 0, currentStreak: 0, duelWins: wins, weeklyRank: null, completedSession: fakeSession }, now).filter((item) => item.requirementType === 'duel_win');
}
