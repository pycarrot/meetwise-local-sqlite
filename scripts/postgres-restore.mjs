import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const connection = new URL(databaseUrl);
const index = process.argv.indexOf('--file');
const file = index >= 0 ? process.argv[index + 1] : undefined;
if (!file) throw new Error('Usage: npm run restore -- --file backups/meetwise.dump');
await access(file);
const child = spawn(
  'pg_restore',
  [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    '--host',
    connection.hostname,
    '--port',
    connection.port || '5432',
    '--username',
    decodeURIComponent(connection.username),
    '--dbname',
    connection.pathname.slice(1),
    file
  ],
  { stdio: 'inherit', env: { ...process.env, PGPASSWORD: decodeURIComponent(connection.password) } }
);
child.on('error', (error) => {
  if (error.code === 'ENOENT')
    process.stderr.write('pg_restore was not found. Install PostgreSQL client tools and retry.\n');
});
const code = await new Promise((resolve) => child.on('close', resolve));
if (code !== 0) process.exit(code ?? 1);
process.stdout.write(
  'Restore completed. Run npm run db:migrate before starting the application.\n'
);
