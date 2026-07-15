import net from 'node:net';
import { spawn } from 'node:child_process';

const databaseUrl = new URL(process.env.DATABASE_URL || '');
const host = databaseUrl.hostname;
const port = Number(databaseUrl.port || 5432);
const deadline = Date.now() + Number(process.env.DATABASE_WAIT_TIMEOUT_MS || 60_000);

while (true) {
  const ready = await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
  if (ready) break;
  if (Date.now() >= deadline)
    throw new Error(`Database was not reachable within the configured timeout`);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

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
