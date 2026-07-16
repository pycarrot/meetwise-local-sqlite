import { createClient } from '@libsql/client';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL || 'file:./data/meetwise.db';
if (!databaseUrl.startsWith('file:')) throw new Error('DATABASE_URL must use a file: URL');
const index = process.argv.indexOf('--file');
const output =
  index >= 0
    ? process.argv[index + 1]
    : `backups/meetwise-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
if (!output) throw new Error('Invalid --file value');
const destination = path.resolve(output);
await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { force: true });
const client = createClient({ url: databaseUrl });
try {
  await client.execute({ sql: 'VACUUM INTO ?', args: [destination] });
} finally {
  client.close();
}
await access(destination);
process.stdout.write(`Consistent SQLite backup written to ${destination}\n`);
