import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Notification } from '../types';

export function NotificationsBell(): JSX.Element {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<Notification[]>([]);
  const unread = items.filter((item) => !item.read).length;
  useEffect(() => { const refresh = (): void => { void api<{ notifications: Notification[] }>('/notifications').then((result) => setItems(result.notifications)).catch(() => undefined); }; refresh(); const poller = window.setInterval(refresh, 20_000); return () => window.clearInterval(poller); }, []);
  async function toggle(): Promise<void> {
    const next = !open; setOpen(next);
    if (next) { const result = await api<{ notifications: Notification[] }>('/notifications').catch(() => ({ notifications: [] })); setItems(result.notifications); }
  }
  async function markRead(item: Notification): Promise<void> { if (item.read) return; await api(`/notifications/${item.id}/read`, { method: 'POST', body: '{}' }).catch(() => undefined); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry)); }
  return <div className="notifications"><button className="bell-button" onClick={() => void toggle()} aria-label="Notifications" aria-expanded={open}>♢{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</button>{open && <section className="notification-panel"><div><p className="eyebrow">IN-APP UPDATES</p><h3>Notifications</h3></div>{items.length ? <ul>{items.map((item) => <li className={item.read ? '' : 'unread'} key={item.id}><button onClick={() => void markRead(item)}><strong>{item.title}</strong><span>{item.message}</span></button></li>)}</ul> : <p className="empty-copy">You’re all caught up.</p>}</section>}</div>;
}
