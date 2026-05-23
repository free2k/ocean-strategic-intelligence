import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function useDB() {
  if (!_db) {
    const config = useRuntimeConfig();
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export { schema };
