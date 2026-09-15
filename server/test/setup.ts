import path from 'node:path';

// Must execute before any DB-backed service import. Test code never touches the app database.
process.env.DATABASE_PATH = path.join(process.cwd(), 'data', 'focusrun.test.db');
