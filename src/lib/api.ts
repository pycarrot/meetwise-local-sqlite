import type {
  CurrentUser,
  Health,
  Meeting,
  MeetingSummary,
  Member,
  Workspace,
  WorkspaceRole
} from '../types';

function csrfToken(): string | undefined {
  const name = location.protocol === 'https:' ? '__Host-meetwise_csrf' : 'meetwise_csrf';
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = csrfToken();
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    const error = new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    Object.assign(error, { status: 0, code: 'NETWORK_ERROR' });
    throw error;
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || `คำขอล้มเหลว (${response.status})`);
    Object.assign(error, {
      status: response.status,
      code: data?.error?.code,
      requestId: data?.error?.requestId
    });
    throw error;
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: CurrentUser; workspaces: Workspace[] }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  register: (displayName: string, email: string, password: string, workspaceName: string) =>
    request<{ user: CurrentUser; workspaces: Workspace[] }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, email, password, workspaceName })
    }),
  logout: () => request<null>('/api/v1/auth/logout', { method: 'POST' }),
  revokeAll: () => request<null>('/api/v1/auth/sessions/revoke-all', { method: 'POST' }),
  me: () => request<{ user: CurrentUser; workspaces: Workspace[] }>('/api/v1/me'),
  ready: () => request<Health>('/api/v1/ready'),
  createWorkspace: (name: string) =>
    request<{ id: string; name: string }>('/api/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  meetings: (workspaceId: string, search = '', speaker = '', cursor = '') =>
    request<{ items: MeetingSummary[]; nextCursor: string | null }>(
      `/api/v1/meetings?${new URLSearchParams({ workspaceId, ...(search ? { search } : {}), ...(speaker ? { speaker } : {}), ...(cursor ? { cursor } : {}) })}`
    ),
  meeting: (workspaceId: string, id: string) =>
    request<Meeting>(`/api/v1/meetings/${id}?workspaceId=${encodeURIComponent(workspaceId)}`),
  analyze: (workspaceId: string, id: string) =>
    request(`/api/v1/meetings/${id}/analyze?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'POST'
    }),
  deleteMeeting: (workspaceId: string, id: string) =>
    request(`/api/v1/meetings/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE'
    }),
  members: (workspaceId: string) =>
    request<{ items: Member[] }>(`/api/v1/workspaces/${workspaceId}/members`),
  addMember: (workspaceId: string, email: string, role: WorkspaceRole) =>
    request<Member>(`/api/v1/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    }),
  updateMember: (workspaceId: string, userId: string, role: WorkspaceRole) =>
    request<Member>(`/api/v1/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    }),
  removeMember: (workspaceId: string, userId: string) =>
    request(`/api/v1/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' })
};
