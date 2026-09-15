import type { CompleteSessionResult } from '../types';

export function ProgressMoments({ result, onClose }: { result: CompleteSessionResult | null; onClose: () => void }): JSX.Element | null {
  if (!result) return null;
  return <>{result.leveledUp && <div className="level-overlay" role="dialog" aria-modal="true"><div><p className="eyebrow">LEVEL UP</p><h2>Level {result.level}</h2><p>You earned <b>+{result.xpAwarded} XP</b> and unlocked a stronger focus run.</p><button className="button button-primary" onClick={onClose}>Continue</button></div></div>}{!result.leveledUp && result.achievementsUnlocked.length > 0 && <div className="achievement-toast" role="status"><div><span>{result.achievementsUnlocked[0].icon}</span><p><b>Achievement unlocked</b>{result.achievementsUnlocked[0].name}</p></div><button onClick={onClose} aria-label="Dismiss">×</button></div>}</>;
}
