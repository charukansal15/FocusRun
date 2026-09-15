import type { LeaderboardEntry } from '../types';
import { formatDuration } from '../lib/format';

export function LeaderboardList({ entries, currentUserId }: { entries: LeaderboardEntry[]; currentUserId: string }): JSX.Element {
  if (!entries.length) return <p className="empty-copy">Invite someone to see the group ranking.</p>;
  return <ol className="leaderboard-list">
    {entries.map((entry) => <li key={entry.userId} className={`${entry.userId === currentUserId ? 'is-current' : ''} ${entry.rank <= 3 ? `place-${entry.rank}` : ''}`}>
      <span className="rank">{entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}</span>
      <span className="leader-name">{entry.username}{entry.userId === currentUserId ? ' (you)' : ''}<small>LV {entry.level} · {entry.xp} XP</small></span>
      <strong>{formatDuration(entry.totalSeconds)}</strong>
    </li>)}
  </ol>;
}
