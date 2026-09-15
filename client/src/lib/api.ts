import type { User } from '../types';

const tokenKey = 'focusrun-token';
export const getToken = (): string | null => localStorage.getItem(tokenKey);
export const saveToken = (token: string): void => localStorage.setItem(tokenKey, token);
export const clearToken = (): void => localStorage.removeItem(tokenKey);

export class ApiError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error?.message ?? 'Request failed. Please try again.', response.status);
  return body as T;
}

export type AuthResponse = { user: User; token: string };
