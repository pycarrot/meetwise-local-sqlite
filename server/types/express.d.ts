import type { WorkspaceRole } from '../../packages/shared/permissions.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        kind: 'web' | 'extension';
        userId: string;
        sessionId: string;
        workspaceId?: string;
        role?: WorkspaceRole;
      };
    }
  }
}

export {};
