import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { and, eq, sql } from 'drizzle-orm';
import { loginSchema, registerSchema } from '../../packages/shared/schemas.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
  extensionSessions,
  users,
  webSessions,
  workspaceMembers,
  workspaces
} from '../db/schema.js';
import { hashPassword, stableSecretHash, verifyPassword } from '../auth/crypto.js';
import { requireCsrf, requireWebAuth } from '../auth/middleware.js';
import {
  createWebSession,
  CSRF_COOKIE,
  listUserWorkspaces,
  revokeWebSession,
  WEB_SESSION_COOKIE
} from '../auth/sessions.js';
import { ApiError } from '../http/errors.js';
import { writeAudit } from '../services/audit.js';

const router = Router();
const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5bWhIlyP2O2nQdKB6jCqGIGZ2H8uQhK';
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (request) =>
    `${ipKeyGenerator(request.ip ?? '')}:${stableSecretHash(String(request.body?.email ?? '').toLowerCase())}`
});

const cookieBase = {
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: 'strict' as const,
  path: '/'
};

router.post('/register', loginLimiter, async (request, response) => {
  const input = registerSchema.parse(request.body);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  if (existing)
    throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, displayName: input.displayName, passwordHash })
      .returning();
    if (!user) throw new Error('Failed to create user');
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: input.workspaceName, createdBy: user.id })
      .returning();
    if (!workspace) throw new Error('Failed to create workspace');
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
    return { user, workspace };
  });

  const session = await createWebSession(created.user.id);
  response.cookie(WEB_SESSION_COOKIE, session.token, { ...cookieBase, expires: session.expiresAt });
  response.cookie(CSRF_COOKIE, session.csrfToken, {
    ...cookieBase,
    httpOnly: false,
    expires: session.expiresAt
  });
  await writeAudit({
    request,
    actorUserId: created.user.id,
    workspaceId: created.workspace.id,
    action: 'auth.register',
    targetType: 'workspace',
    targetId: created.workspace.id,
    success: true
  });
  response.status(201).json({
    user: {
      id: created.user.id,
      email: created.user.email,
      displayName: created.user.displayName,
      status: created.user.status
    },
    workspaces: [{ id: created.workspace.id, name: created.workspace.name, role: 'owner' }]
  });
});

router.post('/login', loginLimiter, async (request, response) => {
  const input = loginSchema.parse(request.body);
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  const valid = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid || user.status !== 'active') {
    await writeAudit({
      request,
      actorUserId: user?.id,
      action: 'auth.login',
      success: false,
      metadata: { emailHash: stableSecretHash(input.email) }
    });
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const oldToken = request.cookies?.[WEB_SESSION_COOKIE] as string | undefined;
  if (oldToken) await revokeWebSession(oldToken);
  const session = await createWebSession(user.id);
  response.cookie(WEB_SESSION_COOKIE, session.token, { ...cookieBase, expires: session.expiresAt });
  response.cookie(CSRF_COOKIE, session.csrfToken, {
    ...cookieBase,
    httpOnly: false,
    expires: session.expiresAt
  });
  await writeAudit({ request, actorUserId: user.id, action: 'auth.login', success: true });
  response.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
    workspaces: await listUserWorkspaces(user.id)
  });
});

router.post('/logout', requireWebAuth, requireCsrf, async (request, response) => {
  const token = request.cookies?.[WEB_SESSION_COOKIE] as string | undefined;
  if (token) await revokeWebSession(token);
  response.clearCookie(WEB_SESSION_COOKIE, cookieBase);
  response.clearCookie(CSRF_COOKIE, { ...cookieBase, httpOnly: false });
  await writeAudit({
    request,
    actorUserId: request.auth!.userId,
    action: 'auth.logout',
    success: true
  });
  response.status(204).end();
});

router.post('/sessions/revoke-all', requireWebAuth, requireCsrf, async (request, response) => {
  await db
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(webSessions.userId, request.auth!.userId), sql`${webSessions.revokedAt} is null`)
    );
  await db
    .update(extensionSessions)
    .set({ revokedAt: new Date(), accessVersion: sql`${extensionSessions.accessVersion} + 1` })
    .where(
      and(
        eq(extensionSessions.userId, request.auth!.userId),
        sql`${extensionSessions.revokedAt} is null`
      )
    );
  response.clearCookie(WEB_SESSION_COOKIE, cookieBase);
  response.clearCookie(CSRF_COOKIE, { ...cookieBase, httpOnly: false });
  await writeAudit({
    request,
    actorUserId: request.auth!.userId,
    action: 'auth.revoke_all',
    success: true
  });
  response.status(204).end();
});

export const authRouter = router;
