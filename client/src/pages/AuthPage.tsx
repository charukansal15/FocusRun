import { useState, type FormEvent } from 'react';
import { api, type AuthResponse } from '../lib/api';

export function AuthPage({ onAuthenticated }: { onAuthenticated: (result: AuthResponse) => void }): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api<AuthResponse>(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(mode === 'login' ? { email, password } : { username, email, password }) });
      onAuthenticated(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to continue.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><section className="auth-hero"><p className="eyebrow">FOCUSRUN / SOCIAL POMODORO</p><h1>Make focus<br /><em>feel shared.</em></h1><p>Run distraction-free study sessions with your people. Quietly build momentum together.</p><div className="signal-line"><span />Private groups · real focus time · no noise</div></section>
    <section className="auth-panel"><div className="brand-mark">FR</div><h2>{mode === 'login' ? 'Welcome back' : 'Start your run'}</h2><p>{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create your private focus space.'}</p>
      <form onSubmit={submit}>
        {mode === 'register' && <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} required /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 8 : 1} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Enter FocusRun' : 'Create account'}</button>
      </form>
      <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </section></main>;
}
