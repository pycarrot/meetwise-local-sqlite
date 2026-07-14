import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(4317),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  OLLAMA_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).max(120).default('llama3.2'),
  MEETWISE_ALLOW_REMOTE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production')
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid Meetwise configuration:\n${details}`);
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!loopbackHosts.has(parsed.data.HOST) && !parsed.data.MEETWISE_ALLOW_REMOTE) {
  throw new Error(
    'Refusing to bind outside loopback. Set MEETWISE_ALLOW_REMOTE=true only behind a trusted authenticated reverse proxy.'
  );
}

export const config = Object.freeze({
  port: parsed.data.PORT,
  host: parsed.data.HOST,
  ollamaUrl: parsed.data.OLLAMA_URL.replace(/\/$/, ''),
  ollamaModel: parsed.data.OLLAMA_MODEL,
  allowRemote: parsed.data.MEETWISE_ALLOW_REMOTE,
  nodeEnv: parsed.data.NODE_ENV
});
