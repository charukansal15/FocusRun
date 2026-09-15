import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Group, Session, Subject } from '../types';
import { TimerRing } from '../components/TimerRing';
import { ProgressMoments } from '../components/ProgressMoments';
import type { CompleteSessionResult } from '../types';

type Phase = 'idle' | 'focus' | 'break' | 'completed';
const subjects: Array<Subject | null> = [null, 'DSA', 'Development', 'DBMS', 'AI/ML', 'College', 'Other'];
export function TimerPage({ onProgress }: { onProgress: () => void }): JSX.Element {
  const [preset, setPreset] = useState<'25/5' | '50/10' | 'custom'>('25/5');
  const [customMinutes, setCustomMinutes] = useState(25);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [finishMessage, setFinishMessage] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completion, setCompletion] = useState<CompleteSessionResult | null>(null);
  const focusMinutes = preset === '25/5' ? 25 : preset === '50/10' ? 50 : customMinutes;
  const breakMinutes = preset === '25/5' ? 5 : preset === '50/10' ? 10 : 5;
  const totalSeconds = phase === 'break' ? breakMinutes * 60 : focusMinutes * 60;

  useEffect(() => { void api<{ groups: Group[] }>('/groups').then((result) => setGroups(result.groups)).catch(() => undefined); }, []);
  useEffect(() => { if (phase === 'idle' || phase === 'completed') setSecondsLeft(focusMinutes * 60); }, [focusMinutes, phase]);
  useEffect(() => {
    if (!endsAt || (phase !== 'focus' && phase !== 'break')) return undefined;
    const tick = (): void => setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 250); return () => window.clearInterval(timer);
  }, [endsAt, phase]);

  const endFocus = useCallback(async (): Promise<void> => {
    if (!activeId || busy) return;
    setBusy(true);
    try {
      const result = await api<CompleteSessionResult>(`/sessions/${activeId}/complete`, { method: 'POST', body: '{}' });
      setCompletion(result); onProgress(); setFinishMessage(`Recorded ${Math.floor(result.session.durationSeconds / 60)} focused minute${Math.floor(result.session.durationSeconds / 60) === 1 ? '' : 's'} · +${result.xpAwarded} XP.`);
      setActiveId(null); setPhase('break'); setSecondsLeft(breakMinutes * 60); setEndsAt(Date.now() + breakMinutes * 60_000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not complete the session.'); setPhase('idle'); }
    finally { setBusy(false); }
  }, [activeId, breakMinutes, busy, onProgress]);
  useEffect(() => { if (phase === 'focus' && secondsLeft === 0) void endFocus(); }, [secondsLeft, phase, endFocus]);
  useEffect(() => { if (phase === 'break' && secondsLeft === 0) { setPhase('completed'); setEndsAt(null); } }, [secondsLeft, phase]);

  async function startFocus(): Promise<void> {
    setError(''); setFinishMessage(''); setBusy(true);
    try {
      const result = await api<{ session: Session }>('/sessions/start', { method: 'POST', body: JSON.stringify({ groupId: groupId || undefined, subject: subject ?? undefined, plannedDurationSeconds: focusMinutes * 60 }) });
      setActiveId(result.session.id); setPhase('focus'); setSecondsLeft(focusMinutes * 60); setEndsAt(Date.now() + focusMinutes * 60_000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start your session.'); }
    finally { setBusy(false); }
  }
  async function abandon(): Promise<void> {
    if (!activeId) return; setBusy(true);
    try { await api(`/sessions/${activeId}/abandon`, { method: 'POST', body: '{}' }); setActiveId(null); setEndsAt(null); setPhase('idle'); setSecondsLeft(focusMinutes * 60); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not abandon this session.'); }
    finally { setBusy(false); }
  }
  function startBreak(): void { setPhase('break'); setSecondsLeft(breakMinutes * 60); setEndsAt(Date.now() + breakMinutes * 60_000); }

  const label = phase === 'focus' ? 'FOCUS' : phase === 'break' ? 'BREAK' : phase === 'completed' ? 'COMPLETE' : 'READY';
  return <div className="page timer-page"><ProgressMoments result={completion} onClose={() => setCompletion(null)} /><section className="timer-layout"><div className="timer-main"><p className="eyebrow">POMODORO RUN</p><TimerRing secondsLeft={secondsLeft} totalSeconds={totalSeconds} label={label} />
    {finishMessage && <p className="completion-note">✓ {finishMessage}</p>}{error && <p className="form-error">{error}</p>}
    <div className="timer-actions">{phase === 'focus' ? <><button className="button button-primary" onClick={() => void endFocus()} disabled={busy}>Finish focus</button><button className="button button-quiet" onClick={() => void abandon()} disabled={busy}>Abandon</button></> : phase === 'break' ? <button className="button button-primary" onClick={() => { setEndsAt(null); setPhase('completed'); }}>Skip break</button> : <button className="button button-primary" onClick={() => void startFocus()} disabled={busy}>{busy ? 'Starting…' : phase === 'completed' ? 'Start another focus' : 'Start focus'}</button>}</div>
  </div><aside className="surface-panel timer-settings"><h2>Set your run</h2><div className="segmented">{(['25/5', '50/10', 'custom'] as const).map((item) => <button key={item} className={preset === item ? 'active' : ''} onClick={() => setPreset(item)}>{item === 'custom' ? 'Custom' : item}</button>)}</div>
    {preset === 'custom' && <label>Focus minutes<input type="number" min="1" max="240" value={customMinutes} onChange={(event) => setCustomMinutes(Math.max(1, Math.min(240, Number(event.target.value) || 1)))} disabled={phase === 'focus'} /></label>}
    <label>Study with<select value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={phase === 'focus'}><option value="">Solo focus</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
    <fieldset disabled={phase === 'focus'}><legend>Subject <small>(optional)</small></legend><div className="subject-chips">{subjects.map((item) => <button type="button" onClick={() => setSubject(item)} className={subject === item ? 'selected' : ''} key={item ?? 'skip'}>{item ?? 'Skip'}</button>)}</div></fieldset>
    {phase === 'idle' && <p className="integrity-note">Focus time is recorded from the server clock when you finish.</p>}{phase === 'completed' && <button className="text-button" onClick={startBreak}>Need a break?</button>}
  </aside></section></div>;
}
