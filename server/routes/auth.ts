import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { and, eq, sql } from 'drizzle-orm';
import { loginSchema } from '../../packages/shared/schemas.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { stableSecretHash, verifyPassword } from '../auth/crypto.js';
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
  await db.execute(
    sql`update web_sessions set revoked_at=now() where user_id=${request.auth!.userId} and revoked_at is null`
  );
  await db.execute(
    sql`update extension_sessions set revoked_at=now(), access_version=access_version+1 where user_id=${request.auth!.userId} and revoked_at is null`
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
