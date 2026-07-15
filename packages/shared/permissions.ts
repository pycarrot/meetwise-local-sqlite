export const workspaceRoles = ['owner', 'admin', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const permissions = [
  'workspace:manage',
  'members:manage',
  'meetings:create',
  'meetings:read',
  'meetings:update',
  'meetings:delete',
  'meetings:analyze',
  'server:health'
] as const;
export type Permission = (typeof permissions)[number];

const rolePermissions: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  owner: new Set(permissions),
  admin: new Set([
    'members:manage',
    'meetings:create',
    'meetings:read',
    'meetings:update',
    'meetings:delete',
    'meetings:analyze',
    'server:health'
  ]),
  member: new Set(['meetings:create', 'meetings:read', 'meetings:update', 'meetings:analyze']),
  viewer: new Set(['meetings:read'])
};

export function roleCan(role: WorkspaceRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
