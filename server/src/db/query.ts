import { pool } from './postgres.js';

export async function query<T = unknown>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, values);
  return result.rows as T[];
}
