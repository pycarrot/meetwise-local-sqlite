import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const connection = new URL(databaseUrl);
const index = process.argv.indexOf('--file');
const output =
  index >= 0
    ? process.argv[index + 1]
    : `backups/meetwise-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
if (!output) throw new Error('Invalid --file value');
await mkdir(path.dirname(path.resolve(output)), { recursive: true });

const child = spawn(
  'pg_dump',
  [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file',
    output,
    '--host',
    connection.hostname,
    '--port',
    connection.port || '5432',
    '--username',
    decodeURIComponent(connection.username),
    '--dbname',
    connection.pathname.slice(1)
  ],
  { stdio: 'inherit', env: { ...process.env, PGPASSWORD: decodeURIComponent(connection.password) } }
);
child.on('error', (error) => {
  if (error.code === 'ENOENT')
    process.stderr.write('pg_dump was not found. Install PostgreSQL client tools and retry.\n');
});
const code = await new Promise((resolve) => child.on('close', resolve));
if (code !== 0) process.exit(code ?? 1);
await access(output);
process.stdout.write(`Backup written to ${path.resolve(output)}\n`);
