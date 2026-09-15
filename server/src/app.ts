import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import sessionRoutes from './routes/sessions.js';
import statsRoutes from './routes/stats.js';
import challengeRoutes from './routes/challenges.js';
import { errorHandler, notFound } from './lib/errors.js';
import { seedAchievements } from './services/achievements.js';
import userRoutes from './routes/users.js';
import notificationRoutes from './routes/notifications.js';
import duelRoutes from './routes/duels.js';
import achievementRoutes from './routes/achievements.js';
import { reconcileProgressCaches } from './services/sessions.js';

export function createApp(): express.Express {
  seedAchievements();
  reconcileProgressCaches();
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());
  app.get('/api/health', (_request, response) => response.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/achievements', achievementRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/duels', duelRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/challenges', challengeRoutes);
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
