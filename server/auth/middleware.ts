import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { roleCan, type Permission } from '../../packages/shared/permissions.js';
import { db } from '../db/client.js';
import { extensionSessions, users, workspaceMembers } from '../db/schema.js';
import { ApiError } from '../http/errors.js';
import { hashToken, safeEqual, verifyExtensionAccessToken } from './crypto.js';
import { CSRF_COOKIE, getWebSession, WEB_SESSION_COOKIE } from './sessions.js';

export async function optionalWebAuth(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = request.cookies?.[WEB_SESSION_COOKIE] as string | undefined;
    if (!token) return next();
    const session = await getWebSession(token);
    if (session?.status === 'active')
      request.auth = { kind: 'web', userId: session.userId, sessionId: session.id };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireWebAuth(request: Request, _response: Response, next: NextFunction): void {
  if (request.auth?.kind !== 'web')
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
  next();
}

export async function requireExtensionAuth(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = request.get('authorization');
    if (!header?.startsWith('Bearer '))
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
    let claims;
    try {
      claims = await verifyExtensionAccessToken(header.slice(7));
    } catch {
      throw new ApiError(401, 'TOKEN_EXPIRED_OR_INVALID', 'Extension session expired or invalid');
    }
    const [session] = await db
      .select({ role: workspaceMembers.role })
      .from(extensionSessions)
      .innerJoin(users, eq(users.id, extensionSessions.userId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, extensionSessions.workspaceId),
          eq(workspaceMembers.userId, extensionSessions.userId)
        )
      )
      .where(
        and(
          eq(extensionSessions.id, claims.sid),
          eq(extensionSessions.userId, claims.sub),
          eq(extensionSessions.workspaceId, claims.wid),
          eq(extensionSessions.accessVersion, claims.ver),
          isNull(extensionSessions.revokedAt),
          gt(extensionSessions.refreshExpiresAt, new Date()),
          eq(users.status, 'active')
        )
      )
      .limit(1);
    if (!session)
      throw new ApiError(401, 'SESSION_REVOKED', 'Extension session is no longer valid');
    request.auth = {
      kind: 'extension',
      userId: claims.sub,
      sessionId: claims.sid,
      workspaceId: claims.wid,
      role: session.role
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireWorkspace(permission: Permission) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.auth) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
      const workspaceId =
        request.params.workspaceId ?? request.query.workspaceId ?? request.auth.workspaceId;
      if (typeof workspaceId !== 'string')
        throw new ApiError(422, 'WORKSPACE_REQUIRED', 'workspaceId is required');
      const [membership] = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, request.auth.userId)
          )
        )
        .limit(1);
      if (!membership || !roleCan(membership.role, permission)) {
        throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to access this resource');
      }
      request.auth.workspaceId = workspaceId;
      request.auth.role = membership.role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireCsrf(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!request.auth || request.auth.kind !== 'web') return next();
    const cookieToken = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const headerToken = request.get('x-csrf-token');
    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      throw new ApiError(403, 'CSRF_INVALID', 'CSRF validation failed');
    }
    const sessionCookie = request.cookies?.[WEB_SESSION_COOKIE] as string | undefined;
    const session = sessionCookie ? await getWebSession(sessionCookie) : null;
    if (!session || !safeEqual(session.csrfHash, hashToken(cookieToken))) {
      throw new ApiError(403, 'CSRF_INVALID', 'CSRF validation failed');
    }
    next();
  } catch (error) {
    next(error);
  }
}
