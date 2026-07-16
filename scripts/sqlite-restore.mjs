import { createClient } from '@libsql/client';
import { access, copyFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL || 'file:./data/meetwise.db';
if (!databaseUrl.startsWith('file:')) throw new Error('DATABASE_URL must use a file: URL');
const targetValue = databaseUrl.slice(5);
if (!targetValue || targetValue === ':memory:')
  throw new Error('Restore requires a persistent SQLite target');
const index = process.argv.indexOf('--file');
const file = index >= 0 ? process.argv[index + 1] : undefined;
if (!file) throw new Error('Usage: npm run restore -- --file backups/meetwise.db');
const source = path.resolve(file);
const target = path.resolve(targetValue);
if (source === target) throw new Error('Backup file and database target must be different');
await access(source);
for (const suffix of ['-wal', '-shm']) {
  if (
    await stat(`${target}${suffix}`)
      .then(() => true)
      .catch(() => false)
  )
    throw new Error(
      `Refusing restore while ${path.basename(target)}${suffix} exists. Stop app and worker cleanly, then retry.`
    );
}
const verifier = createClient({ url: `file:${source}` });
try {
  const result = await verifier.execute('PRAGMA integrity_check');
  if (result.rows[0]?.integrity_check !== 'ok')
    throw new Error('Backup failed SQLite integrity_check');
} finally {
  verifier.close();
}
const temporary = `${target}.restore-${process.pid}`;
await copyFile(source, temporary);
await rename(temporary, target);
await rm(`${target}-journal`, { force: true });
process.stdout.write(
  'Restore completed. Run npm run db:migrate before starting the application.\n'
);
