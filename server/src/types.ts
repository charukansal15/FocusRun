import type { Request } from 'express';

export type Subject = 'DSA' | 'Development' | 'DBMS' | 'AI/ML' | 'College' | 'Other';
export type Theme = 'deep-focus' | 'arcade-neon' | 'zen-light' | 'night-owl';

export interface User {
  id: string;
  username: string;
  email: string;
  preferredTheme: Theme;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  dailyGoalMinutes: number | null;
  lastActiveDate: string | null;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  groupId: string | null;
  subject: Subject | null;
  durationSeconds: number;
  plannedDurationSeconds: number;
  startedAt: string;
  completedAt: string | null;
  status: 'active' | 'completed' | 'abandoned';
}

export interface Challenge {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
}

export type AchievementRequirement = 'first_session' | 'total_minutes' | 'sessions_in_one_day' | 'total_hours' | 'streak_days' | 'duel_win' | 'group_weekly_rank_1' | 'session_before_time' | 'session_after_time';
export interface Achievement { id: string; name: string; description: string; icon: string; requirementType: AchievementRequirement; requirementValue: number }
export interface UnlockedAchievement extends Achievement { unlockedAt: string }
export type DuelType = '24h' | 'week';
export type DuelStatus = 'pending' | 'accepted' | 'declined' | 'active' | 'completed';
export interface Duel { id: string; groupId: string; challengerId: string; opponentId: string; type: DuelType; startDate: string; endDate: string; status: DuelStatus; winnerId: string | null }
export interface DuelView extends Duel {
  challengerUsername: string;
  opponentUsername: string;
  challengerSeconds: number;
  opponentSeconds: number;
  endsInSeconds: number;
  winnerUsername: string | null;
}
export type NotificationType = 'streak' | 'level_up' | 'rank_first' | 'duel_challenge' | 'overtaken' | 'daily_goal' | 'achievement';
export interface Notification { id: string; userId: string; type: NotificationType; title: string; message: string; read: boolean; createdAt: string }
export interface ActivityEvent { id: string; groupId: string; userId: string; username: string; type: string; title: string; message: string; createdAt: string }

export type AuthedRequest = Request & { userId?: string };
