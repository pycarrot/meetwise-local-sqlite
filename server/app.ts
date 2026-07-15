import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config } from './config.js';
import { databaseReady } from './db/client.js';
import { users } from './db/schema.js';
import { db } from './db/client.js';
import { optionalWebAuth, requireWebAuth } from './auth/middleware.js';
import { listUserWorkspaces } from './auth/sessions.js';
import { errorHandler, notFound } from './http/errors.js';
import { ollamaStatus } from './integrations/ollama.js';
import { authRouter } from './routes/auth.js';
import { extensionAuthRouter } from './routes/extension-auth.js';
import { meetingsRouter } from './routes/meetings.js';
import { workspacesRouter } from './routes/workspaces.js';

const logger = pino({
  level: config.logLevel,
  base: null,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'refreshToken',
      'accessToken',
      'DATABASE_URL'
    ],
    censor: '[REDACTED]'
  }
});

export function createApp(): Express {
  const app = express();
  const rootDir = process.cwd();
  app.disable('x-powered-by');
  if (config.trustProxy !== false) app.set('trust proxy', config.trustProxy);
  app.use(
    pinoHttp({
      logger,
      genReqId(request, response) {
        const incoming = request.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(incoming)
            ? incoming
            : randomUUID();
        response.setHeader('x-request-id', id);
        return id;
      },
      customProps(request) {
        return { requestId: request.id };
      },
      serializers: {
        req(request) {
          return { id: request.id, method: request.method, url: request.url?.split('?')[0] };
        },
        res(response) {
          return { statusCode: response.statusCode };
        }
      }
    })
  );
  app.use((request, _response, next) => {
    request.requestId = String(request.id);
    next();
  });
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: config.secureCookies
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false
    })
  );
  app.use(compression());
  app.use(
    cors({
      origin(origin, callback) {
        if (
          !origin ||
          origin === config.publicBaseUrl ||
          config.corsAllowedOrigins.includes(origin)
        )
          return callback(null, true);
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'content-type',
        'authorization',
        'idempotency-key',
        'x-csrf-token',
        'x-request-id'
      ],
      credentials: true,
      maxAge: 600
    })
  );
  app.use(express.json({ limit: config.maxJsonBody, strict: true }));
  app.use(cookieParser());
  app.use(optionalWebAuth);

  app.get('/api/v1/health', (_request, response) => response.json({ ok: true }));
  app.get('/api/v1/ready', async (_request, response) => {
    const [database, ollama] = await Promise.all([databaseReady(), ollamaStatus()]);
    const ready = database && ollama.connected && ollama.modelAvailable;
    response
      .status(ready ? 200 : 503)
      .json({ ready, dependencies: { database: { ready: database }, ollama } });
  });
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/extension/sessions', extensionAuthRouter);
  app.use('/api/v1/workspaces', workspacesRouter);
  app.use('/api/v1/meetings', meetingsRouter);
  app.get('/api/v1/me', requireWebAuth, async (request, response) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status
      })
      .from(users)
      .where(eq(users.id, request.auth!.userId))
      .limit(1);
    response.json({ user, workspaces: await listUserWorkspaces(request.auth!.userId) });
  });

  if (config.nodeEnv !== 'test') {
    app.use(
      express.static(path.join(rootDir, 'dist'), {
        maxAge: config.nodeEnv === 'production' ? '1h' : 0,
        immutable: config.nodeEnv === 'production'
      })
    );
    app.get('/{*path}', (request, response, next) => {
      if (request.path.startsWith('/api/')) return next();
      response.sendFile(path.join(rootDir, 'dist', 'index.html'));
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
