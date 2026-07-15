import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import {
  memberCreateSchema,
  memberUpdateSchema,
  uuidSchema,
  workspaceCreateSchema
} from '../../packages/shared/schemas.js';
import { db } from '../db/client.js';
import { users, workspaceMembers, workspaces } from '../db/schema.js';
import { requireCsrf, requireWebAuth, requireWorkspace } from '../auth/middleware.js';
import { ApiError } from '../http/errors.js';
import { writeAudit } from '../services/audit.js';

const router = Router();
router.use(requireWebAuth);

router.get('/', async (request, response) => {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
      createdAt: workspaces.createdAt
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, request.auth!.userId))
    .orderBy(workspaces.name);
  response.json({ items: rows });
});

router.post('/', requireCsrf, async (request, response) => {
  const input = workspaceCreateSchema.parse(request.body);
  const workspace = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(workspaces)
      .values({ name: input.name, createdBy: request.auth!.userId })
      .returning();
    if (!created) throw new Error('Failed to create workspace');
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: created.id, userId: request.auth!.userId, role: 'owner' });
    return created;
  });
  await writeAudit({
    request,
    actorUserId: request.auth!.userId,
    workspaceId: workspace.id,
    action: 'workspace.create',
    targetType: 'workspace',
    targetId: workspace.id,
    success: true
  });
  response.status(201).json(workspace);
});

router.get(
  '/:workspaceId/members',
  requireWorkspace('members:manage'),
  async (request, response) => {
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    const rows = await db
      .select({
        id: workspaceMembers.id,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(users.email);
    response.json({ items: rows });
  }
);

router.post(
  '/:workspaceId/members',
  requireCsrf,
  requireWorkspace('members:manage'),
  async (request, response) => {
    const input = memberCreateSchema.parse(request.body);
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    if (input.role === 'owner' && request.auth!.role !== 'owner')
      throw new ApiError(403, 'FORBIDDEN', 'Only owners can add owners');
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email})=${input.email}`)
      .limit(1);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'No account exists for this email');
    const [member] = await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: user.id, role: input.role })
      .onConflictDoNothing()
      .returning();
    if (!member) throw new ApiError(409, 'MEMBER_EXISTS', 'User is already a workspace member');
    await writeAudit({
      request,
      actorUserId: request.auth!.userId,
      workspaceId,
      action: 'member.add',
      targetType: 'user',
      targetId: user.id,
      success: true,
      metadata: { role: input.role }
    });
    response.status(201).json(member);
  }
);

router.patch(
  '/:workspaceId/members/:userId',
  requireCsrf,
  requireWorkspace('members:manage'),
  async (request, response) => {
    const userId = uuidSchema.parse(request.params.userId);
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    const input = memberUpdateSchema.parse(request.body);
    const [target] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
      )
      .limit(1);
    if (target?.role === 'owner' && request.auth!.role !== 'owner')
      throw new ApiError(403, 'FORBIDDEN', 'Only owners can change an owner');
    if (input.role === 'owner' && request.auth!.role !== 'owner')
      throw new ApiError(403, 'FORBIDDEN', 'Only owners can assign owner role');
    await assertOwnerSafety(workspaceId, userId, input.role);
    const [member] = await db
      .update(workspaceMembers)
      .set({ role: input.role, updatedAt: new Date() })
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
      )
      .returning();
    if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
    await writeAudit({
      request,
      actorUserId: request.auth!.userId,
      workspaceId,
      action: 'member.role_change',
      targetType: 'user',
      targetId: userId,
      success: true,
      metadata: { role: input.role }
    });
    response.json(member);
  }
);

router.delete(
  '/:workspaceId/members/:userId',
  requireCsrf,
  requireWorkspace('members:manage'),
  async (request, response) => {
    const userId = uuidSchema.parse(request.params.userId);
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    const [target] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
      )
      .limit(1);
    if (target?.role === 'owner' && request.auth!.role !== 'owner')
      throw new ApiError(403, 'FORBIDDEN', 'Only owners can remove an owner');
    await assertOwnerSafety(workspaceId, userId, null);
    const deleted = await db
      .delete(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
      )
      .returning({ id: workspaceMembers.id });
    if (!deleted.length) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
    await writeAudit({
      request,
      actorUserId: request.auth!.userId,
      workspaceId,
      action: 'member.remove',
      targetType: 'user',
      targetId: userId,
      success: true
    });
    response.status(204).end();
  }
);

async function assertOwnerSafety(
  workspaceId: string,
  userId: string,
  nextRole: string | null
): Promise<void> {
  const [target] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (target?.role !== 'owner' || nextRole === 'owner') return;
  const [count] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')));
  if ((count?.value ?? 0) <= 1)
    throw new ApiError(409, 'LAST_OWNER', 'A workspace must retain at least one owner');
}

export const workspacesRouter = router;
