import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, saveToken, type AuthResponse } from './lib/api';
import type { Theme, User } from './types';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { TimerPage } from './pages/TimerPage';
import { HistoryPage } from './pages/HistoryPage';
import { GroupsPage } from './pages/GroupsPage';
import { ProfilePage } from './pages/ProfilePage';
import { Loading } from './components/Loading';
import { NotificationsBell } from './components/NotificationsBell';

type Page = 'dashboard' | 'timer' | 'history' | 'groups' | 'profile';
const nav: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' }, { id: 'timer', label: 'Timer', icon: '◷' }, { id: 'history', label: 'History', icon: '≡' }, { id: 'groups', label: 'Groups', icon: '◎' }, { id: 'profile', label: 'Profile', icon: '◌' },
];
const localThemeKey = 'focusrun-theme';

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(localThemeKey) as Theme) || 'deep-focus');
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(localThemeKey, theme); }, [theme]);
  useEffect(() => { void api<{ user: User }>('/auth/me').then((result) => { setUser(result.user); setTheme(result.user.preferredTheme); }).catch(() => clearToken()).finally(() => setLoading(false)); }, []);
  function authenticated(result: AuthResponse): void { saveToken(result.token); setUser(result.user); setTheme(result.user.preferredTheme); }
  async function changeTheme(next: Theme): Promise<void> { setTheme(next); try { const result = await api<{ user: User }>('/auth/me/theme', { method: 'PATCH', body: JSON.stringify({ theme: next }) }); setUser(result.user); } catch { /* Local storage remains a resilient fallback. */ } }
  function signOut(): void { void api('/auth/logout', { method: 'POST' }).catch(() => undefined); clearToken(); setUser(null); setPage('dashboard'); }
  const refreshUser = useCallback((): void => { void api<{ user: User }>('/auth/me').then((result) => setUser(result.user)).catch(() => undefined); }, []);
  if (loading) return <Loading />;
  if (!user) return <AuthPage onAuthenticated={authenticated} />;
  const content = page === 'dashboard' ? <DashboardPage user={user} onStart={() => setPage('timer')} onUserUpdate={setUser} /> : page === 'timer' ? <TimerPage onProgress={refreshUser} /> : page === 'history' ? <HistoryPage /> : page === 'groups' ? <GroupsPage user={user} /> : <ProfilePage user={user} theme={theme} onTheme={(next) => void changeTheme(next)} />;
  return <div className="app-shell"><aside className="sidebar"><div className="logo"><span>FR</span><b>FocusRun</b></div><nav>{nav.map((item) => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><i>{item.icon}</i>{item.label}</button>)}</nav><div className="sidebar-footer"><NotificationsBell /><p>MODE</p><select aria-label="Choose visual mood" value={theme} onChange={(event) => void changeTheme(event.target.value as Theme)}><option value="deep-focus">Deep focus</option><option value="arcade-neon">Arcade neon</option><option value="zen-light">Zen light</option><option value="night-owl">Night owl</option></select><button className="sign-out" onClick={signOut}>Sign out</button></div></aside><main className="app-main"><header className="mobile-header"><div className="logo"><span>FR</span><b>FocusRun</b></div><div className="mobile-controls"><NotificationsBell /><select aria-label="Choose visual mood" value={theme} onChange={(event) => void changeTheme(event.target.value as Theme)}><option value="deep-focus">Deep focus</option><option value="arcade-neon">Arcade neon</option><option value="zen-light">Zen light</option><option value="night-owl">Night owl</option></select></div></header>{content}<nav className="mobile-nav" aria-label="Main navigation">{nav.map((item) => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav></main></div>;
}
