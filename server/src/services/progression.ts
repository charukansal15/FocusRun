export const DAILY_GOAL_BONUS_XP = 50;
export const BATTLE_WIN_BONUS_XP = 25;
export const EARLY_BIRD_HHMM = 700;
export const NIGHT_OWL_HHMM = 2300;
export const ACTIVITY_MINIMUM_SECONDS = 25 * 60;

export function thresholdForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('Level must be a positive integer.');
  return 100 * (level - 1) + 25 * (level - 1) * (level - 2);
}

export function levelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (thresholdForLevel(level + 1) <= safeXp) level += 1;
  return level;
}

export function xpIntoLevel(xp: number): number {
  return Math.max(0, Math.floor(xp)) - thresholdForLevel(levelForXp(xp));
}

export function xpForNextLevel(xp: number): number {
  const level = levelForXp(xp);
  return thresholdForLevel(level + 1) - thresholdForLevel(level);
}

export function progressionForXp(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  return { level: levelForXp(xp), xpIntoLevel: xpIntoLevel(xp), xpForNextLevel: xpForNextLevel(xp) };
}
