import { createServer } from 'node:http';
import { createApp } from './app.js';
import { closeDatabase } from './db/client.js';
import { config } from './config.js';

const server = createServer(createApp());
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, config.host, () => {
  process.stdout.write(
    `${JSON.stringify({ level: 'info', event: 'server_started', host: config.host, port: config.port })}\n`
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'shutdown_started', signal })}\n`);
  const force = setTimeout(() => process.exit(1), 25_000).unref();
  server.close(async (error) => {
    try {
      await closeDatabase();
    } finally {
      clearTimeout(force);
      process.exit(error ? 1 : 0);
    }
  });
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
