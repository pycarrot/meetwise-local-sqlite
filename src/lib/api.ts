import type { Health, Meeting, MeetingSummary } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  health: () => request<Health>('/api/health'),
  meetings: () => request<MeetingSummary[]>('/api/meetings'),
  meeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  analyze: (id: string) =>
    request<Meeting>(`/api/meetings/${id}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
};
