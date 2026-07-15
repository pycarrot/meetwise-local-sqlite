import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
  ssl: config.databaseSsl
    ? { rejectUnauthorized: config.databaseSslRejectUnauthorized }
    : undefined,
  statement_timeout: config.databaseStatementTimeoutMs,
  application_name: 'meetwise'
});

pool.on('error', (error) => {
  process.stderr.write(
    `${JSON.stringify({ level: 'error', event: 'database_pool_error', message: error.message })}\n`
  );
});

export const db = drizzle(pool, { schema });

export async function databaseReady(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
