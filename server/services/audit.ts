import type { Request } from 'express';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { stableSecretHash } from '../auth/crypto.js';

export async function writeAudit(input: {
  request?: Request;
  actorUserId?: string | null | undefined;
  workspaceId?: string | null | undefined;
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  success: boolean;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const ip = input.request?.ip;
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    workspaceId: input.workspaceId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    success: input.success,
    ipHash: ip ? stableSecretHash(ip) : null,
    metadata: input.metadata ?? {}
  });
}
