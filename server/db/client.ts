import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { config } from '../config.js';
import * as schema from './schema.js';

export const client = createClient({ url: config.databaseUrl });

await client.execute('PRAGMA foreign_keys = ON');
await client.execute('PRAGMA journal_mode = WAL');
await client.execute('PRAGMA synchronous = NORMAL');
await client.execute(`PRAGMA busy_timeout = ${config.databaseBusyTimeoutMs}`);
await client.execute('PRAGMA temp_store = MEMORY');

export const db = drizzle(client, { schema });

export async function databaseReady(): Promise<boolean> {
  try {
    await client.execute('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function checkpointDatabase(): Promise<void> {
  await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
}

export async function closeDatabase(): Promise<void> {
  client.close();
}
