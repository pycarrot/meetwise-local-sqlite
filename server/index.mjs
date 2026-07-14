import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { config } from './config.mjs';
import { analyzeWithOllama, ollamaStatus } from './ollama.mjs';
import { getMeeting, listMeetings, saveAnalysis, saveMeeting } from './store.mjs';
import { parseMeetingImport } from './validation.mjs';

const app = express();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    }
  })
);
app.use(compression());
app.use(
  cors({
    origin: [
      /^chrome-extension:\/\/[a-p]{32}$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type']
  })
);
app.use(express.json({ limit: '5mb', strict: true }));

const importLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8' });
const analysisLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8' });

app.get('/api/health', async (_request, response) => {
  response.json({ ok: true, ollama: await ollamaStatus() });
});

app.get('/api/meetings', async (_request, response) => {
  response.json(await listMeetings());
});

app.get('/api/meetings/:id', async (request, response) => {
  const meeting = await getMeeting(request.params.id);
  if (!meeting) return response.status(404).json({ error: 'ไม่พบการประชุม' });
  response.json(meeting);
});

app.post('/api/meetings/import', importLimiter, async (request, response) => {
  const meeting = await saveMeeting(parseMeetingImport(request.body));
  response.status(201).json(meeting);
});

app.post('/api/meetings/:id/analyze', analysisLimiter, async (request, response, next) => {
  try {
    const meeting = await getMeeting(request.params.id);
    if (!meeting) return response.status(404).json({ error: 'ไม่พบการประชุม' });
    if (!meeting.segments.length)
      return response.status(400).json({ error: 'ไม่มีบทสนทนาให้วิเคราะห์' });
    const analysis = await analyzeWithOllama(meeting);
    response.json(await saveAnalysis(meeting.id, analysis));
  } catch (error) {
    next(error);
  }
});

app.use(
  express.static(path.join(rootDir, 'dist'), { maxAge: config.nodeEnv === 'production' ? '1h' : 0 })
);
app.get('/{*path}', (request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  response.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  if (error instanceof ZodError) {
    return response.status(422).json({
      error: 'ข้อมูลการประชุมไม่ถูกต้อง',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    });
  }
  response.status(502).json({ error: error.message || 'เกิดข้อผิดพลาดภายในระบบ' });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Meetwise Local API: http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down cleanly`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
