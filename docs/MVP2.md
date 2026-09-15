# FocusRun MVP2

Backend is source of truth for XP, levels, streaks, achievements, leaderboard, duels. Never trust client-sent values.

## Features
1. XP — 1 completed focus minute = 1 XP. None for breaks/cancelled. Server-calculated.
2. Levels — XP thresholds, progress bar, level-up event.
3. Achievements — 10-15, auto-unlock from real activity: First Focus, Hour Power, Grind Mode, 10/50/100 Hours, 3/7-Day Streak, Rival, Champion, Early Bird, Night Owl.
4. Streaks — current + longest; +1 per calendar day with >=1 completed session; handle consecutive days correctly.
5. Daily goal — user-set target; show done/target mins, %, complete state, small XP bonus on completion.
6. Leaderboard — tabs Today/Week/Month/All Time; cols rank, username, focus time, XP, level; highlight current user.
7. Friend activity — group-scoped events only: session completed, goal completed, level reached, streak milestone, overtook user. No chat/comments/likes.
8. Weekly battle — extend existing weekly challenge: participants, focus time, ranking, time left, winner on end.
9. Duels — 1v1 in group (most focus next 24h / this week): challenger, opponent, scores, time left, winner.
10. Subject stats — weekly breakdown across DSA, Development, DBMS, AI/ML, College, Other: time per subject, top subject, session count, avg length. Lightweight chart ok.
11. Profile — username, level, XP + progress, current/longest streak, total + weekly focus time, achievements, group rank.
12. Level-up overlay — old -> new level, XP earned, dismissable.
13. In-app notifications — bell + items: streak, level, achievement, duel invite, overtaken, goal complete. No push.
14. Dashboard — today's focus, daily goal, streak, level/XP, group rank, active duel, weekly battle, recent achievements, recent sessions, Start Focus button.

## Rules
- Reuse existing DB, auth, API structure, components, timer, leaderboard, groups. No duplicates.
- Extend existing models before adding new ones.
- No new dependencies unless unavoidable.
- Keep current visual identity: modern, polished, slightly game-like, subtle animation only. No 3D/game engines.

## Out of scope
App/site blocking, distraction detection, AI coach/plans, map/world, characters, seasons, payments, betting, chat, comments, likes, push, WebSockets.

## Done =
`npm run build && npm run typecheck && npm run lint && npm test` all pass, plus manual flow: login -> dashboard -> start focus -> complete -> XP, level, streak, achievement, daily goal, leaderboard, activity, duel/battle all update. Never claim verified without running it.