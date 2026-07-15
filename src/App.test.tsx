// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './lib/api';

vi.mock('./lib/api', () => ({
  api: {
    me: vi.fn(),
    ready: vi.fn(),
    meetings: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    revokeAll: vi.fn()
  }
}));

describe('dashboard authentication and role-aware UI', () => {
  beforeEach(() => {
    vi.mocked(api.ready).mockRejectedValue(new Error('offline'));
  });
  it('guards the dashboard with a real login form', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('unauthenticated'));
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'เข้าสู่ระบบ Meetwise' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveAttribute('type', 'password');
  });
  it('does not render member administration for viewers', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'v@example.com', displayName: 'Viewer', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'viewer' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText('ยังไม่มีการประชุมใน workspace นี้ เปิด extension เพื่อเริ่มจับคำบรรยาย')
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'สมาชิก Workspace' })).not.toBeInTheDocument();
  });
});
