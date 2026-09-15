import { formatCountdown } from '../lib/format';

interface TimerRingProps { secondsLeft: number; totalSeconds: number; label: string }

export function TimerRing({ secondsLeft, totalSeconds, label }: TimerRingProps): JSX.Element {
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 1;
  return <div className="timer-ring" aria-label={`${label}: ${formatCountdown(secondsLeft)}`}>
    <svg viewBox="0 0 240 240" role="img" aria-hidden="true">
      <circle className="ring-track" cx="120" cy="120" r={radius} />
      <circle className="ring-progress" cx="120" cy="120" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
    </svg>
    <div className="timer-copy"><span>{label}</span><strong>{formatCountdown(secondsLeft)}</strong></div>
  </div>;
}
