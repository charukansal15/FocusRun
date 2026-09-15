import type { User } from '../types';

export function LevelProgress({ user, compact = false }: { user: User; compact?: boolean }): JSX.Element {
  const level = user.level ?? 1; const current = user.xpIntoLevel ?? 0; const needed = user.xpForNextLevel ?? 100;
  const percent = Math.min(100, Math.round((current / Math.max(needed, 1)) * 100));
  return <div className={`level-progress ${compact ? 'compact' : ''}`} aria-label={`Level ${level}, ${current} of ${needed} XP to next level`}>
    <span className="level-badge">LV {level}</span><div className="xp-track"><div className="xp-fill" style={{ width: `${percent}%` }} /><span>{current} / {needed} XP</span></div>{!compact && <strong>{user.xp} XP</strong>}
  </div>;
}
