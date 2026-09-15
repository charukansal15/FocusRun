export type Theme = 'deep-focus' | 'arcade-neon' | 'zen-light' | 'night-owl';
export type Subject = 'DSA' | 'Development' | 'DBMS' | 'AI/ML' | 'College' | 'Other';

export interface User { id: string; username: string; email: string; preferredTheme: Theme; xp: number; currentStreak: number; longestStreak: number; dailyGoalMinutes: number | null; lastActiveDate: string | null; level?: number; xpIntoLevel?: number; xpForNextLevel?: number; createdAt: string }
export interface Group { id: string; name: string; inviteCode: string; createdBy: string; createdAt: string }
export interface Session { id: string; userId: string; groupId: string | null; subject: Subject | null; durationSeconds: number; plannedDurationSeconds: number; startedAt: string; completedAt: string | null; status: 'active' | 'completed' | 'abandoned' }
export interface Stats { todaySeconds: number; weekSeconds: number; totalSeconds: number; currentStreakDays: number }
export interface LeaderboardEntry { userId: string; username: string; totalSeconds: number; xp: number; level: number; rank: number }
export interface Challenge { id: string; groupId: string; title: string; description: string | null; startDate: string; endDate: string }
export type AchievementRequirement = 'first_session' | 'total_minutes' | 'sessions_in_one_day' | 'total_hours' | 'streak_days' | 'duel_win' | 'group_weekly_rank_1' | 'session_before_time' | 'session_after_time';
export interface Achievement { id: string; name: string; description: string; icon: string; requirementType: AchievementRequirement; requirementValue: number }
export interface UnlockedAchievement extends Achievement { unlockedAt: string }
export interface ActivityEvent { id: string; groupId: string; userId: string; username: string; type: string; title: string; message: string; createdAt: string }
export interface Duel { id: string; groupId: string; challengerId: string; opponentId: string; type: '24h' | 'week'; startDate: string; endDate: string; status: 'pending' | 'accepted' | 'declined' | 'active' | 'completed'; winnerId: string | null; challengerUsername?: string; opponentUsername?: string; challengerSeconds?: number; opponentSeconds?: number; endsInSeconds?: number; winnerUsername?: string | null }
export interface Notification { id: string; userId: string; type: 'streak' | 'level_up' | 'rank_first' | 'duel_challenge' | 'overtaken' | 'daily_goal' | 'achievement'; title: string; message: string; read: boolean; createdAt: string }
export interface CompleteSessionResult { session: Session; totals: { todaySeconds: number; totalSeconds: number }; xpAwarded: number; xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number; leveledUp: boolean; newLevel?: number; streak: { current: number; longest: number }; dailyGoal?: { goalMinutes: number; todayMinutes: number; justCompleted: boolean }; achievementsUnlocked: Achievement[] }
