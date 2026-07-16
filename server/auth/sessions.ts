import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  extensionSessions,
  users,
  webSessions,
  workspaceMembers,
  workspaces
} from '../db/schema.js';
import { config } from '../config.js';
import { hashToken, randomToken, signExtensionAccessToken } from './crypto.js';

export const WEB_SESSION_COOKIE = config.secureCookies
  ? '__Host-meetwise_session'
  : 'meetwise_session';
export const CSRF_COOKIE = config.secureCookies ? '__Host-meetwise_csrf' : 'meetwise_csrf';

export async function createWebSession(userId: string) {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000);
  const [session] = await db
    .insert(webSessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      csrfHash: hashToken(csrfToken),
      expiresAt
    })
    .returning({ id: webSessions.id });
  if (!session) throw new Error('Failed to create session');
  return { id: session.id, token, csrfToken, expiresAt };
}

export async function getWebSession(token: string) {
  const [row] = await db
    .select({
      id: webSessions.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      status: users.status,
      csrfHash: webSessions.csrfHash
    })
    .from(webSessions)
    .innerJoin(users, eq(users.id, webSessions.userId))
    .where(
      and(
        eq(webSessions.tokenHash, hashToken(token)),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, new Date())
      )
    )
    .limit(1);
  if (row)
    await db.update(webSessions).set({ lastSeenAt: new Date() }).where(eq(webSessions.id, row.id));
  return row ?? null;
}

export async function revokeWebSession(token: string): Promise<void> {
  await db
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(webSessions.tokenHash, hashToken(token)), isNull(webSessions.revokedAt)));
}

export async function createExtensionSession(userId: string, workspaceId: string) {
  const refreshToken = randomToken(48);
  const refreshExpiresAt = new Date(Date.now() + config.extensionRefreshTtlDays * 86_400_000);
  const [session] = await db
    .insert(extensionSessions)
    .values({
      userId,
      workspaceId,
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt
    })
    .returning({ id: extensionSessions.id, accessVersion: extensionSessions.accessVersion });
  if (!session) throw new Error('Failed to create extension session');
  const accessToken = await signExtensionAccessToken({
    sub: userId,
    sid: session.id,
    wid: workspaceId,
    ver: session.accessVersion
  });
  return {
    sessionId: session.id,
    accessToken,
    refreshToken,
    accessExpiresInSeconds: config.extensionAccessTtlMinutes * 60
  };
}

export async function rotateExtensionSession(refreshToken: string, requestedWorkspaceId?: string) {
  return db.transaction(async (tx) => {
    const oldHash = hashToken(refreshToken);
    const [current] = await tx
      .select({
        id: extensionSessions.id,
        userId: extensionSessions.userId,
        workspaceId: extensionSessions.workspaceId,
        accessVersion: extensionSessions.accessVersion,
        status: users.status
      })
      .from(extensionSessions)
      .innerJoin(users, eq(users.id, extensionSessions.userId))
      .where(
        and(
          eq(extensionSessions.refreshTokenHash, oldHash),
          isNull(extensionSessions.revokedAt),
          gt(extensionSessions.refreshExpiresAt, new Date())
        )
      )
      .limit(1);
    if (!current || current.status !== 'active') return null;
    const workspaceId = requestedWorkspaceId ?? current.workspaceId;
    const [membership] = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, current.userId)
        )
      )
      .limit(1);
    if (!membership) return null;
    const nextRefresh = randomToken(48);
    const nextVersion = current.accessVersion + 1;
    const updated = await tx
      .update(extensionSessions)
      .set({
        refreshTokenHash: hashToken(nextRefresh),
        workspaceId,
        accessVersion: nextVersion,
        lastUsedAt: new Date()
      })
      .where(
        and(eq(extensionSessions.id, current.id), eq(extensionSessions.refreshTokenHash, oldHash))
      )
      .returning({ id: extensionSessions.id });
    if (!updated.length) return null;
    const accessToken = await signExtensionAccessToken({
      sub: current.userId,
      sid: current.id,
      wid: workspaceId,
      ver: nextVersion
    });
    return {
      sessionId: current.id,
      accessToken,
      refreshToken: nextRefresh,
      accessExpiresInSeconds: config.extensionAccessTtlMinutes * 60,
      workspaceId,
      role: membership.role
    };
  });
}

export async function revokeExtensionSession(sessionId: string, userId: string): Promise<void> {
  await db
    .update(extensionSessions)
    .set({ revokedAt: new Date(), accessVersion: sql`${extensionSessions.accessVersion} + 1` })
    .where(and(eq(extensionSessions.id, sessionId), eq(extensionSessions.userId, userId)));
}

export async function listUserWorkspaces(userId: string) {
  return db
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.name);
}
