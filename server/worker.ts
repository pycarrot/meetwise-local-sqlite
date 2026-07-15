import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { closeDatabase } from './db/client.js';
import { config } from './config.js';
import { processNextJob } from './services/analysis-jobs.js';

const workerId = `worker-${randomUUID()}`;
let stopped = false;

async function run(): Promise<void> {
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'worker_started', workerId })}\n`);
  while (!stopped) {
    try {
      const results = await Promise.all(
        Array.from({ length: config.ollamaMaxConcurrency }, (_, index) =>
          processNextJob(`${workerId}-${index}`)
        )
      );
      if (!results.some(Boolean)) await delay(1_000);
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          level: 'error',
          event: 'worker_error',
          workerId,
          message: error instanceof Error ? error.message : 'Unknown worker error'
        })}\n`
      );
      await delay(2_000);
    }
  }
  await closeDatabase();
}

function stop(): void {
  stopped = true;
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
void run();
