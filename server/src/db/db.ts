import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const schemaCandidates = [
  path.join(sourceDir, 'schema.sql'),
  path.join(process.cwd(), 'src', 'db', 'schema.sql'),
  path.join(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
];
const schemaPath = schemaCandidates.find(existsSync);
if (!schemaPath) throw new Error('FocusRun database schema could not be found.');
const configuredPath = process.env.DATABASE_PATH;
const databasePath = configuredPath ?? path.join(process.cwd(), 'data', 'focusrun.db');

if (!existsSync(path.dirname(databasePath))) mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.exec(readFileSync(schemaPath, 'utf8'));

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// MVP 2 is deliberately additive so existing MVP 1 SQLite files remain usable.
ensureColumn('users', 'xp', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'current_streak', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'longest_streak', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'daily_goal_minutes', 'INTEGER');
ensureColumn('users', 'last_active_date', 'TEXT');
ensureColumn('challenges', 'winner_id', 'TEXT REFERENCES users(id)');
ensureColumn('challenges', 'bonus_awarded', 'INTEGER NOT NULL DEFAULT 0');

export function clearDatabase(): void {
  db.exec(`
    DELETE FROM daily_goal_rewards;
    DELETE FROM activity_log;
    DELETE FROM notifications;
    DELETE FROM duels;
    DELETE FROM user_achievements;
    DELETE FROM challenges;
    DELETE FROM focus_sessions;
    DELETE FROM group_members;
    DELETE FROM groups;
    DELETE FROM users;
  `);
}
