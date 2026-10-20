import pg from "pg";

// Return DATE columns as 'YYYY-MM-DD' strings instead of local-time Date objects.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

const globalForPool = globalThis as unknown as { pool?: pg.Pool };
const pool = globalForPool.pool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL });
globalForPool.pool = pool;

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
