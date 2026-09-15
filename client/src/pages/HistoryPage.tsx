import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { dateLabel, formatDuration } from '../lib/format';
import type { Session } from '../types';
import { Loading } from '../components/Loading';

export function HistoryPage(): JSX.Element {
  const [range, setRange] = useState<'today' | 'week'>('week');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setSessions(null); void api<{ sessions: Session[] }>(`/sessions?range=${range}`).then((result) => setSessions(result.sessions)).catch((caught: Error) => { setError(caught.message); setSessions([]); }); }, [range]);
  const grouped = useMemo(() => (sessions ?? []).reduce<Record<string, Session[]>>((result, session) => {
    const day = session.completedAt?.slice(0, 10) ?? session.startedAt.slice(0, 10); (result[day] ??= []).push(session); return result;
  }, {}), [sessions]);
  if (!sessions) return <Loading />;
  return <div className="page"><section className="page-heading compact"><div><p className="eyebrow">MISSION LOG</p><h1>Focus history</h1><p>Every completed focus mission, from the server record.</p></div><div className="segmented range-control"><button className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>Today</button><button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>This week</button></div></section>
    {error && <p className="form-error">{error}</p>}
    <section className="history-list">{Object.entries(grouped).length ? Object.entries(grouped).map(([day, daySessions]) => <article className="surface-panel history-day" key={day}><div className="panel-heading"><h2>{day === new Date().toISOString().slice(0, 10) ? 'Today' : dateLabel(`${day}T12:00:00`)}</h2><strong>{formatDuration(daySessions.reduce((sum, item) => sum + item.durationSeconds, 0))}</strong></div><ul className="session-list">{daySessions.map((session) => <li key={session.id}><div><strong>{session.subject ?? 'Focus mission'}</strong><span>{session.groupId ? 'Group mission' : 'Solo mission'}</span></div><b>{formatDuration(session.durationSeconds)}</b></li>)}</ul></article>) : <article className="surface-panel empty-state"><h2>No completed missions yet</h2><p>Start a focus run and this log will build itself.</p></article>}</section></div>;
}
