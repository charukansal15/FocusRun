import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthedRequest } from '../types.js';
import { ApiError } from '../lib/errors.js';

const jwtSecret = process.env.JWT_SECRET ?? 'focusrun-local-development-secret';

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: '14d' });
}

export function requireAuth(request: AuthedRequest, _response: Response, next: NextFunction): void {
  const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.'));
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('Invalid token');
    request.userId = payload.sub;
    next();
  } catch {
    next(new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.'));
  }
}
