import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

let _pool: pg.Pool | null = null;
export function usePool() { return _pool ||= new pg.Pool({connectionString: useRuntimeConfig().databaseUrl}); }

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function useDB() {
  if (!_db) {
    const pool = usePool();
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export { schema };
