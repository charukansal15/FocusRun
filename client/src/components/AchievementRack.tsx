import type { Achievement, UnlockedAchievement } from '../types';

export function AchievementRack({ all, unlocked, limit }: { all: Achievement[]; unlocked: UnlockedAchievement[]; limit?: number }): JSX.Element {
  const unlockedIds = new Set(unlocked.map((item) => item.id)); const visible = limit ? all.slice(0, limit) : all;
  return <div className="achievement-rack">{visible.map((achievement) => <div className={`achievement-icon ${unlockedIds.has(achievement.id) ? 'unlocked' : 'locked'}`} key={achievement.id} title={`${achievement.name}: ${achievement.description}`}><span>{achievement.icon}</span><small>{achievement.name}</small></div>)}</div>;
}
