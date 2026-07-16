import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { type Agent } from 'supertest';

let app: import('express').Express;
let db: typeof import('./db/client.js').db;
let closeDatabase: typeof import('./db/client.js').closeDatabase;
let schema: typeof import('./db/schema.js');
let processNextJob: typeof import('./services/analysis-jobs.js').processNextJob;
let hashPassword: typeof import('./auth/crypto.js').hashPassword;
let mockOllama: Server;
let workspaceA: string;
let workspaceB: string;
let userA: string;
let userB: string;
let password = 'CorrectHorse7Battery';
const databasePath = `/tmp/meetwise-integration-${process.pid}.db`;

function csrfFrom(response: request.Response): string {
  const values = response.headers['set-cookie'] as unknown as string[];
  const cookie = values.find((value) => value.startsWith('meetwise_csrf='));
  if (!cookie) throw new Error('CSRF cookie not returned');
  return cookie.split(';')[0]!.split('=')[1]!;
}

async function login(agent: Agent, email: string) {
  const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { csrf: csrfFrom(response), body: response.body };
}

beforeAll(async () => {
  await Promise.all([
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true })
  ]);
  mockOllama = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'test-model' }] }));
    if (req.url === '/api/chat') {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (body.includes('FORCE_TIMEOUT')) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        if (!res.destroyed) res.end('{}');
        return;
      }
      return res.end(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              summary: ['Validated summary'],
              decisions: ['Decision'],
              actionItems: [],
              topics: []
            })
          }
        })
      );
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((resolve) => mockOllama.listen(0, '127.0.0.1', resolve));
  const port = (mockOllama.address() as AddressInfo).port;
  process.env.NODE_ENV = 'test';
  process.env.DEPLOYMENT_MODE = 'local';
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.OLLAMA_URL = `http://127.0.0.1:${port}`;
  process.env.OLLAMA_MODEL = 'test-model';
  process.env.OLLAMA_TIMEOUT_MS = '1000';
  process.env.ANALYSIS_MAX_ATTEMPTS = '1';
  ({ db, closeDatabase } = await import('./db/client.js'));
  schema = await import('./db/schema.js');
  const { migrate } = await import('./db/migrate.js');
  await migrate();
  ({ hashPassword } = await import('./auth/crypto.js'));
  ({ processNextJob } = await import('./services/analysis-jobs.js'));
  const appModule = await import('./app.js');
  app = appModule.createApp();
  const passwordHash = await hashPassword(password);
  const created = await db
    .insert(schema.users)
    .values([
      { email: 'a@example.com', displayName: 'Owner A', passwordHash },
      { email: 'b@example.com', displayName: 'Owner B', passwordHash }
    ])
    .returning();
  userA = created[0]!.id;
  userB = created[1]!.id;
  const spaces = await db
    .insert(schema.workspaces)
    .values([
      { name: 'Workspace A', createdBy: userA },
      { name: 'Workspace B', createdBy: userB }
    ])
    .returning();
  workspaceA = spaces[0]!.id;
  workspaceB = spaces[1]!.id;
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: workspaceA, userId: userA, role: 'owner' },
    { workspaceId: workspaceB, userId: userB, role: 'owner' }
  ]);
});

afterAll(async () => {
  await closeDatabase?.();
  await new Promise<void>((resolve) => mockOllama?.close(() => resolve()));
  await Promise.all([
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true })
  ]);
});

describe('production API integration', () => {
  let meetingId: string;
  it('logs in with a rotated cookie session and revokes it on logout', async () => {
    const agent = request.agent(app);
    const auth = await login(agent, 'a@example.com');
    await agent.get('/api/v1/me').expect(200);
    await agent.post('/api/v1/auth/logout').set('x-csrf-token', auth.csrf).expect(204);
    await agent.get('/api/v1/me').expect(401);
  });

  it('rotates extension refresh credentials and ingests idempotently', async () => {
    const session = await request(app)
      .post('/api/v1/extension/sessions')
      .send({ email: 'a@example.com', password })
      .expect(201);
    expect(session.body.workspace.id).toBe(workspaceA);
    const firstRefresh = session.body.refreshToken as string;
    const rotated = await request(app)
      .post('/api/v1/extension/sessions/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    await request(app)
      .post('/api/v1/extension/sessions/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(401);
    const payload = {
      title: 'Tenant A meeting',
      source: 'google-meet-caption',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      segments: [{ clientId: 's1', speaker: 'Alice', text: 'hello', startMs: 0, endMs: 500 }]
    };
    const key = 'stableidempotencykey1234567890';
    const first = await request(app)
      .post('/api/v1/meetings/ingest')
      .set('authorization', `Bearer ${rotated.body.accessToken}`)
      .set('idempotency-key', key)
      .send(payload)
      .expect(201);
    meetingId = first.body.meeting.id;
    const replay = await request(app)
      .post('/api/v1/meetings/ingest')
      .set('authorization', `Bearer ${rotated.body.accessToken}`)
      .set('idempotency-key', key)
      .send(payload)
      .expect(200);
    expect(replay.body.meeting.id).toBe(meetingId);
    await request(app)
      .post('/api/v1/meetings/ingest')
      .set('authorization', `Bearer ${rotated.body.accessToken}`)
      .set('idempotency-key', key)
      .send({ ...payload, title: 'Changed' })
      .expect(409);
  });

  it('prevents cross-workspace reads, deletes, and analysis even with a known meeting ID', async () => {
    const agentB = request.agent(app);
    const authB = await login(agentB, 'b@example.com');
    await agentB.get(`/api/v1/meetings/${meetingId}?workspaceId=${workspaceB}`).expect(404);
    await agentB
      .delete(`/api/v1/meetings/${meetingId}?workspaceId=${workspaceB}`)
      .set('x-csrf-token', authB.csrf)
      .expect(404);
    await agentB
      .post(`/api/v1/meetings/${meetingId}/analyze?workspaceId=${workspaceB}`)
      .set('x-csrf-token', authB.csrf)
      .expect(404);
  });

  it('searches transcript content through tenant-scoped SQLite FTS5', async () => {
    const agentA = request.agent(app);
    await login(agentA, 'a@example.com');
    const result = await agentA
      .get('/api/v1/meetings')
      .query({ workspaceId: workspaceA, search: 'hell' })
      .expect(200);
    expect(result.body.items.map((item: { id: string }) => item.id)).toContain(meetingId);
    await agentA
      .get('/api/v1/meetings')
      .query({ workspaceId: workspaceA, search: '" malformed' })
      .expect(200);
  });

  it('runs analysis through the SQLite job state machine', async () => {
    const agentA = request.agent(app);
    const authA = await login(agentA, 'a@example.com');
    await agentA
      .post(`/api/v1/meetings/${meetingId}/analyze?workspaceId=${workspaceA}`)
      .set('x-csrf-token', authA.csrf)
      .expect(202);
    expect(await processNextJob('integration-worker')).toBe(true);
    const result = await agentA
      .get(`/api/v1/meetings/${meetingId}?workspaceId=${workspaceA}`)
      .expect(200);
    expect(result.body.analysis.status).toBe('completed');
    expect(result.body.analysis.summary).toEqual(['Validated summary']);
  });

  it('records a sanitized failed state when Ollama times out', async () => {
    const [meeting] = await db
      .insert(schema.meetings)
      .values({
        workspaceId: workspaceA,
        createdBy: userA,
        title: 'Timeout meeting',
        source: 'test',
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt: new Date('2026-02-01T00:01:00Z')
      })
      .returning();
    await db.insert(schema.transcriptSegments).values({
      meetingId: meeting!.id,
      position: 0,
      speaker: 'A',
      text: 'FORCE_TIMEOUT',
      startMs: 0,
      endMs: 100
    });
    const agentA = request.agent(app);
    const authA = await login(agentA, 'a@example.com');
    await agentA
      .post(`/api/v1/meetings/${meeting!.id}/analyze?workspaceId=${workspaceA}`)
      .set('x-csrf-token', authA.csrf)
      .expect(202);
    expect(await processNextJob('timeout-worker')).toBe(true);
    const result = await agentA
      .get(`/api/v1/meetings/${meeting!.id}?workspaceId=${workspaceA}`)
      .expect(200);
    expect(result.body.analysis.status).toBe('failed');
    expect(result.body.analysis.failureReason).toBe('Ollama request timed out');
  });

  it('soft-deletes a same-workspace meeting and then hides it', async () => {
    const [meeting] = await db
      .insert(schema.meetings)
      .values({
        workspaceId: workspaceA,
        createdBy: userA,
        title: 'Delete me',
        source: 'test',
        startedAt: new Date('2026-03-01T00:00:00Z'),
        endedAt: new Date('2026-03-01T00:01:00Z')
      })
      .returning();
    const agentA = request.agent(app);
    const authA = await login(agentA, 'a@example.com');
    await agentA
      .delete(`/api/v1/meetings/${meeting!.id}?workspaceId=${workspaceA}`)
      .set('x-csrf-token', authA.csrf)
      .expect(204);
    await agentA.get(`/api/v1/meetings/${meeting!.id}?workspaceId=${workspaceA}`).expect(404);
  });

  it('enforces role authorization for extension ingestion', async () => {
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: workspaceA, userId: userB, role: 'viewer' });
    const session = await request(app)
      .post('/api/v1/extension/sessions')
      .send({ email: 'b@example.com', password, workspaceId: workspaceA })
      .expect(201);
    await request(app)
      .post('/api/v1/meetings/ingest')
      .set('authorization', `Bearer ${session.body.accessToken}`)
      .set('idempotency-key', 'viewerattemptkey123456789012')
      .send({
        title: 'No',
        source: 'google-meet-caption',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-01T00:01:00Z',
        segments: [{ speaker: 'B', text: 'no', startMs: 0, endMs: 1 }]
      })
      .expect(403);
  });
});
