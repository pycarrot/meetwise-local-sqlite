import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL || '';
if (!databaseUrl.startsWith('file:')) throw new Error('DATABASE_URL must use a file: URL');
const databasePath = databaseUrl.slice(5);
if (!databasePath || databasePath === ':memory:')
  throw new Error('Production requires a persistent SQLite file');
await mkdir(path.dirname(path.resolve(databasePath)), { recursive: true });

if (process.env.RUN_MIGRATIONS === 'true') {
  const migration = spawn(process.execPath, ['dist-server/server/cli.js', 'db:migrate'], {
    stdio: 'inherit',
    env: process.env
  });
  const code = await new Promise((resolve) => migration.once('close', resolve));
  if (code !== 0) throw new Error(`Database migration failed with exit code ${code}`);
}

const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
const code = await new Promise((resolve) => child.once('close', resolve));
process.exit(code ?? 1);
