import { ApiError } from './errors.js';
import type { Subject, Theme } from '../types.js';

export const subjects: Subject[] = ['DSA', 'Development', 'DBMS', 'AI/ML', 'College', 'Other'];
export const themes: Theme[] = ['deep-focus', 'arcade-neon', 'zen-light', 'night-owl'];

export function requireString(value: unknown, label: string, min = 1, max = 200): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be between ${min} and ${max} characters.`);
  }
  return value.trim();
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, 'Email', 3, 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid email address.');
  return email;
}

export function requirePositiveInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function parseSubject(value: unknown): Subject | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !subjects.includes(value as Subject)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Subject is not supported.');
  }
  return value as Subject;
}

export function parseTheme(value: unknown): Theme {
  if (typeof value !== 'string' || !themes.includes(value as Theme)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Theme is not supported.');
  }
  return value as Theme;
}
