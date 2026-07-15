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
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: CurrentUser; workspaces: Workspace[] }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  logout: () => request<null>('/api/v1/auth/logout', { method: 'POST' }),
  revokeAll: () => request<null>('/api/v1/auth/sessions/revoke-all', { method: 'POST' }),
  me: () => request<{ user: CurrentUser; workspaces: Workspace[] }>('/api/v1/me'),
  ready: () => request<Health>('/api/v1/ready'),
  meetings: (workspaceId: string, search = '', speaker = '') =>
    request<{ items: MeetingSummary[]; nextCursor: string | null }>(
      `/api/v1/meetings?${new URLSearchParams({ workspaceId, ...(search ? { search } : {}), ...(speaker ? { speaker } : {}) })}`
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
