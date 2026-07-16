import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { client } from './client.js';

const migrationsDir = path.resolve(process.cwd(), 'migrations');

export async function migrate(): Promise<string[]> {
  await client.execute(`create table if not exists meetwise_migrations (
    name text primary key,
    applied_at integer not null default (unixepoch('subsec') * 1000)
  )`);
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const appliedRows = await client.execute('select name from meetwise_migrations');
  const applied = new Set(appliedRows.rows.map((row) => String(row.name)));
  const completed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const migrationSql = await readFile(path.join(migrationsDir, file), 'utf8');
    const tx = await client.transaction('write');
    try {
      await tx.executeMultiple(migrationSql);
      await tx.execute({ sql: 'insert into meetwise_migrations(name) values(?)', args: [file] });
      await tx.commit();
      completed.push(file);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
  return completed;
}

export async function migrationStatus() {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const result = await client
    .execute('select name, applied_at from meetwise_migrations order by name')
    .catch(() => ({ rows: [] }));
  const applied = new Map(
    result.rows.map((row) => [String(row.name), new Date(Number(row.applied_at))])
  );
  return files.map((name) => ({ name, appliedAt: applied.get(name) ?? null }));
}
