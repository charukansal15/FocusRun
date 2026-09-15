# FocusRun

FocusRun is a private social Pomodoro app for small study groups. MVP 2 keeps the calm productivity core and adds lightweight, server-verified competition: completing focus missions grows XP, levels, achievements, streaks, group Battles, and friend Duels.

## MVP 1 foundation

- Email/password registration, login, logout, and persistent token-based sessions
- Private groups with short invite codes, member lists, and safe duplicate joins
- 25/5, 50/10, and custom Pomodoro timers with optional subject tags
- Server-timed session recording, history, daily/weekly/total statistics
- Four instant, responsive mood themes: Deep Focus, Arcade Neon, Zen Light, and Night Owl

## MVP 2 features

- **XP and Levels:** one XP per verified, completed focus minute; the API returns level progress and level-up events
- **Achievements:** 12 server-unlocked achievements, including first focus, streak, hour, morning/night, rank, and duel milestones
- **Streaks and Daily Goals:** server UTC calendar-day streaks, configurable daily goals, and one 50-XP daily-goal bonus per user/day
- **Improved Leaderboards:** Today, Week, Month, and All Time tabs; rows include focus time, all-time XP, and level
- **Friend Activity:** bounded, group-scoped read-only activity for substantial missions, milestones, level-ups, and achievement unlocks
- **Weekly Battles:** existing group challenge extended with a countdown and a server-derived winner after expiry
- **Friend Duels:** group-member 24-hour or 1-week challenges, with status transitions and session-derived winners
- **Subject Statistics:** weekly subject breakdown, most-studied subject, mission count, and average mission duration
- **Notifications:** in-app bell for levels, achievements, goals, streaks, and duels; no push notifications

The interface deliberately does **not** include chat, comments, likes, DMs, payments, OAuth, website blocking, AI coaching, WebSockets, maps/worlds, avatar customization, or native apps.

## Stack

- React 18, TypeScript, Vite, and plain CSS custom properties
- Node.js, Express, TypeScript
- SQLite via `better-sqlite3`
- JWT bearer tokens and bcrypt password hashing
- Vitest + Supertest integration tests

## Run locally

Prerequisite: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

In a second terminal, run:

```bash
npm run dev:client
```

Then open `http://localhost:5173`. The API runs on `http://localhost:3001`; the Vite development server proxies `/api` requests to it. SQLite is initialized automatically at `server/data/focusrun.db` on first run. Optionally set `DATABASE_PATH`, `JWT_SECRET`, `PORT`, and `CLIENT_ORIGIN` before starting the server.

For the full verification suite:

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Account and session actions |
| GET | `/api/auth/me` | Restore the signed-in user, XP, level progress, streaks, and goal |
| PATCH | `/api/auth/me/theme` | Save a selected visual mood |
| POST | `/api/groups`, `/api/groups/join` | Create or join a group |
| GET | `/api/groups`, `/api/groups/:id` | List groups and members |
| GET | `/api/groups/:id/leaderboard?range=today|week|month|all_time` | Group rankings with XP and level |
| GET | `/api/groups/:id/activity` | Bounded, group-scoped activity feed |
| POST | `/api/sessions/start` | Start a server-timed focus session |
| POST | `/api/sessions/:id/complete` | Complete a focus session |
| POST | `/api/sessions/:id/abandon` | Explicitly discard an active focus session |
| GET | `/api/sessions?range=today|week`, `/api/stats` | History and aggregate stats |
| GET | `/api/stats/subjects?range=week` | Subject breakdown and mission aggregates |
| POST | `/api/challenges` | Create a group challenge |
| GET | `/api/groups/:id/challenge` | Current challenge and standings |
| PATCH | `/api/users/me/daily-goal` | Set a daily focus goal |
| GET | `/api/achievements`, `/api/achievements/me` | Achievement catalogue and unlocked items |
| POST / GET | `/api/duels`, `/api/duels/:id` | Create/list a duel or inspect live scores |
| POST | `/api/duels/:id/accept`, `/api/duels/:id/decline` | Respond to a duel invitation |
| GET / POST | `/api/notifications`, `/api/notifications/:id/read` | In-app updates and read state |

Errors use `{ "error": { "code": string, "message": string } }` consistently.

## Implementation notes

Theme selection is persisted two ways: immediately in `localStorage` (instant and resilient across refreshes) and in the signed-in user record through `PATCH /api/auth/me/theme` (so it follows the account).

Timer integrity is intentionally basic. The server writes `startedAt` when a mission begins and, on completion, records the lesser of actual server-clock elapsed time or `plannedDurationSeconds + 8 seconds`. It prevents a client from claiming hours of focus, but it is not sophisticated anti-cheat: there is no device verification or behavioral validation. Abandoned missions are explicitly stored with zero focus time and zero XP.

XP, levels, streaks, achievements, goals, leaderboard rank, battle winners, and duel winners are derived and validated server-side. Cached user progression is reconciled from completed session/reward records at app startup. Streaks use the **server UTC calendar day** for every user; per-user timezone support is intentionally deferred. The daily-goal bonus is defined once as `DAILY_GOAL_BONUS_XP = 50`.

## Future features — not implemented

- **MVP 3:** website/app blocking, focus mode, distraction tracking, mobile app, desktop app.
- **MVP 4:** AI study coach, AI-generated study plans, smart productivity insights.
- **MVP 5:** gamified map/world, avatar/character system, seasons, unlockable environments, deeper game mechanics.
