import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { eq, sql } from 'drizzle-orm';
import { extensionLoginSchema, refreshExtensionSchema } from '../../packages/shared/schemas.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { requireExtensionAuth } from '../auth/middleware.js';
import {
  createExtensionSession,
  listUserWorkspaces,
  revokeExtensionSession,
  rotateExtensionSession
} from '../auth/sessions.js';
import { stableSecretHash, verifyPassword } from '../auth/crypto.js';
import { ApiError } from '../http/errors.js';
import { writeAudit } from '../services/audit.js';

const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5bWhIlyP2O2nQdKB6jCqGIGZ2H8uQhK';

router.post('/', limiter, async (request, response) => {
  const input = extensionLoginSchema.parse(request.body);
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
      action: 'extension.login',
      success: false,
      metadata: { emailHash: stableSecretHash(input.email) }
    });
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const workspaces = await listUserWorkspaces(user.id);
  const selected = input.workspaceId
    ? workspaces.find((workspace) => workspace.id === input.workspaceId)
    : workspaces[0];
  if (!selected) throw new ApiError(403, 'NO_WORKSPACE', 'No authorized workspace is available');
  const session = await createExtensionSession(user.id, selected.id);
  await writeAudit({
    request,
    actorUserId: user.id,
    workspaceId: selected.id,
    action: 'extension.login',
    targetType: 'extension_session',
    targetId: session.sessionId,
    success: true
  });
  response.status(201).json({
    ...session,
    user: { id: user.id, email: user.email, displayName: user.displayName },
    workspace: selected,
    workspaces
  });
});

router.post('/refresh', limiter, async (request, response) => {
  const input = refreshExtensionSchema.parse(request.body);
  const rotated = await rotateExtensionSession(input.refreshToken, input.workspaceId);
  if (!rotated) throw new ApiError(401, 'REFRESH_INVALID', 'Extension session expired or invalid');
  response.json(rotated);
});

router.delete('/current', requireExtensionAuth, async (request, response) => {
  await revokeExtensionSession(request.auth!.sessionId, request.auth!.userId);
  await writeAudit({
    request,
    actorUserId: request.auth!.userId,
    workspaceId: request.auth!.workspaceId,
    action: 'extension.logout',
    targetType: 'extension_session',
    targetId: request.auth!.sessionId,
    success: true
  });
  response.status(204).end();
});

router.get('/current', requireExtensionAuth, async (request, response) => {
  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, request.auth!.userId))
    .limit(1);
  response.json({
    user,
    workspaceId: request.auth!.workspaceId,
    role: request.auth!.role,
    workspaces: await listUserWorkspaces(request.auth!.userId)
  });
});

export const extensionAuthRouter = router;
