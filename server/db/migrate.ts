import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { pool } from './client.js';

const migrationsDir = path.resolve(process.cwd(), 'migrations');

export async function migrate(databasePool: pg.Pool = pool): Promise<string[]> {
  const client = await databasePool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [812742391]);
    await client.query(`create table if not exists meetwise_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
    const appliedRows = await client.query<{ name: string }>(
      'select name from meetwise_migrations'
    );
    const applied = new Set(appliedRows.rows.map((row) => row.name));
    const completed: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into meetwise_migrations(name) values($1)', [file]);
        await client.query('commit');
        completed.push(file);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
    return completed;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [812742391]).catch(() => undefined);
    client.release();
  }
}

export async function migrationStatus(databasePool: pg.Pool = pool) {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const result = await databasePool
    .query<{ name: string; applied_at: Date }>(
      'select name, applied_at from meetwise_migrations order by name'
    )
    .catch(() => ({ rows: [] as { name: string; applied_at: Date }[] }));
  const applied = new Map(result.rows.map((row) => [row.name, row.applied_at]));
  return files.map((name) => ({ name, appliedAt: applied.get(name) ?? null }));
}
