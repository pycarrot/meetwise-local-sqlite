// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { th } from './i18n/th';
import { api } from './lib/api';
import type { Meeting } from './types';

const meetingSummary = (id: string, workspaceId = 'w') => ({
  id,
  workspaceId,
  title: `Meeting ${id}`,
  source: 'source',
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: '2026-01-01T00:01:00Z',
  createdAt: '',
  updatedAt: '',
  segmentCount: 0,
  analysisStatus: null
});
const fullMeeting = (id: string, status: Meeting['analysis'] = null): Meeting => ({
  ...meetingSummary(id),
  segments: [],
  speakerStats: [],
  analysis: status
});

vi.mock('./lib/api', () => ({
  api: {
    me: vi.fn(),
    ready: vi.fn(),
    meetings: vi.fn(),
    meeting: vi.fn(),
    analyze: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    revokeAll: vi.fn(),
    members: vi.fn(),
    addMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    deleteMeeting: vi.fn(),
    createWorkspace: vi.fn()
  }
}));

describe('dashboard authentication and role-aware UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.ready).mockRejectedValue(new Error('offline'));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it('guards the dashboard with a real login form', async () => {
    vi.mocked(api.me).mockRejectedValue(
      Object.assign(new Error('unauthenticated'), { status: 401 })
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'เข้าสู่ระบบ Meetwise' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveAttribute('type', 'password');
  });
  it('shows a retryable server error instead of treating it as logout', async () => {
    vi.mocked(api.me).mockRejectedValue(
      Object.assign(new Error('เซิร์ฟเวอร์ไม่ตอบสนอง'), { status: 500 })
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'เข้าสู่ระบบ Meetwise' })).not.toBeInTheDocument();
  });
  it('shows the same retryable bootstrap state for a network rejection', async () => {
    vi.mocked(api.me).mockRejectedValue(
      Object.assign(new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'), { status: 0 })
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' })
    ).toBeInTheDocument();
    expect(screen.getByText('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')).toBeInTheDocument();
  });

  it.each([
    [Object.assign(new Error('unauthorized'), { status: 401 }), 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
    [new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'), 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้']
  ])('shows a useful login failure and restores the control', async (failure, message) => {
    vi.mocked(api.me).mockRejectedValue(
      Object.assign(new Error('unauthenticated'), { status: 401 })
    );
    vi.mocked(api.login).mockRejectedValue(failure);
    render(<App />);
    fireEvent.change(await screen.findByLabelText('อีเมล'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeEnabled();
  });

  it('prevents a rapid duplicate login request', async () => {
    vi.mocked(api.me).mockRejectedValue(
      Object.assign(new Error('unauthenticated'), { status: 401 })
    );
    let finishLogin: (value: Awaited<ReturnType<typeof api.login>>) => void = () => undefined;
    vi.mocked(api.login).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLogin = resolve;
        })
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText('อีเมล'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'secret' } });
    const button = screen.getByRole('button', { name: 'เข้าสู่ระบบ' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.login).toHaveBeenCalledTimes(1);
    await act(async () =>
      finishLogin({
        user: { id: 'u', email: 'a@example.com', displayName: 'A', status: 'active' },
        workspaces: []
      })
    );
  });

  it('lets a user register with their own password and first workspace', async () => {
    vi.mocked(api.me).mockRejectedValue(
      Object.assign(new Error('unauthenticated'), { status: 401 })
    );
    vi.mocked(api.register).mockResolvedValue({
      user: { id: 'u', email: 'new@example.com', displayName: 'New User', status: 'active' },
      workspaces: [{ id: 'w', name: 'My Team', role: 'owner' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'ยังไม่มีบัญชี สมัครใช้งาน' }));
    fireEvent.change(screen.getByLabelText('ชื่อที่แสดง'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText('ชื่อ Workspace'), { target: { value: 'My Team' } });
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'StrongPassword7' } });
    fireEvent.click(screen.getByRole('button', { name: 'สมัครและสร้าง Workspace' }));
    expect(api.register).toHaveBeenCalledWith(
      'New User',
      'new@example.com',
      'StrongPassword7',
      'My Team'
    );
    expect(
      await screen.findByRole('heading', { name: 'เริ่มบันทึกการประชุมครั้งแรก' })
    ).toBeInTheDocument();
  });

  it('lets an existing account create its first workspace', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: []
    });
    vi.mocked(api.createWorkspace).mockResolvedValue({ id: 'w', name: 'Internal Team' });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    render(<App />);
    fireEvent.change(await screen.findByLabelText('ชื่อ Workspace'), {
      target: { value: 'Internal Team' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'สร้าง Workspace' }));
    expect(api.createWorkspace).toHaveBeenCalledWith('Internal Team');
    expect(
      await screen.findByRole('heading', { name: 'เริ่มบันทึกการประชุมครั้งแรก' })
    ).toBeInTheDocument();
  });

  it('lets a signed-in user create and switch to another workspace', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [{ id: 'w1', name: 'First', role: 'owner' }]
    });
    vi.mocked(api.createWorkspace).mockResolvedValue({ id: 'w2', name: 'Second' });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'บัญชีและระบบ' }));
    fireEvent.change(screen.getByLabelText('ชื่อ Workspace'), { target: { value: 'Second' } });
    fireEvent.click(screen.getByRole('button', { name: 'สร้าง Workspace' }));
    await waitFor(() => expect(screen.getByLabelText('พื้นที่ทำงาน')).toHaveValue('w2'));
    expect(screen.getByRole('option', { name: 'Second' })).toBeInTheDocument();
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
        screen.getByRole('heading', { name: 'เริ่มบันทึกการประชุมครั้งแรก' })
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'สมาชิกพื้นที่ทำงาน' })).not.toBeInTheDocument();
  });

  it('keeps the dashboard rendered while analysis polling refreshes in the background', async () => {
    let poll: (() => void) | undefined;
    const clear = vi.spyOn(globalThis, 'clearInterval');
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback) => {
      if (typeof callback === 'function') poll = callback;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'm@example.com', displayName: 'Member', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({
      items: [
        {
          id: 'm1',
          workspaceId: 'w',
          title: 'ประชุมทีม',
          source: 'google-meet-caption',
          startedAt: '2026-01-01T00:00:00Z',
          endedAt: '2026-01-01T00:01:00Z',
          createdAt: '2026-01-01T00:01:00Z',
          updatedAt: '2026-01-01T00:01:00Z',
          segmentCount: 1,
          analysisStatus: 'pending'
        }
      ],
      nextCursor: null
    });
    const pendingMeeting = {
      id: 'm1',
      workspaceId: 'w',
      title: 'ประชุมทีม',
      source: 'google-meet-caption',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      createdAt: '2026-01-01T00:01:00Z',
      updatedAt: '2026-01-01T00:01:00Z',
      segments: [{ id: 's', speaker: 'A', text: 'hello', startMs: 0, endMs: 300 }],
      speakerStats: [],
      analysis: {
        id: 'a',
        status: 'pending' as const,
        model: null,
        analyzedAt: null,
        failureReason: null,
        attemptCount: 0
      }
    };
    vi.mocked(api.meeting).mockResolvedValueOnce(pendingMeeting);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'ประชุมทีม' })).toBeInTheDocument();

    let finishPoll: (meeting: Meeting) => void = () => undefined;
    vi.mocked(api.meeting).mockImplementationOnce(
      () =>
        new Promise<Meeting>((resolve) => {
          finishPoll = resolve;
        })
    );
    act(() => poll?.());
    expect(screen.getByRole('heading', { name: 'ประชุมทีม' })).toBeInTheDocument();
    expect(document.querySelector('.loading-screen')).not.toBeInTheDocument();

    await act(async () => {
      finishPoll({
        ...pendingMeeting,
        analysis: { ...pendingMeeting.analysis, status: 'completed', summary: ['เสร็จแล้ว'] }
      });
    });
    expect(await screen.findByText('เสร็จแล้ว', {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(clear).toHaveBeenCalledWith(1);
  });

  it('clears analysis polling when the dashboard unmounts', async () => {
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(
      7 as unknown as ReturnType<typeof setInterval>
    );
    const clear = vi.spyOn(globalThis, 'clearInterval');
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'm@example.com', displayName: 'Member', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({
      items: [
        {
          id: 'm1',
          workspaceId: 'w',
          title: 'ประชุมทีม',
          source: 'source',
          startedAt: '2026-01-01T00:00:00Z',
          endedAt: '2026-01-01T00:01:00Z',
          createdAt: '',
          updatedAt: '',
          segmentCount: 0,
          analysisStatus: 'running'
        }
      ],
      nextCursor: null
    });
    vi.mocked(api.meeting).mockResolvedValue({
      id: 'm1',
      workspaceId: 'w',
      title: 'ประชุมทีม',
      source: 'source',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      createdAt: '',
      updatedAt: '',
      segments: [],
      speakerStats: [],
      analysis: {
        id: 'a',
        status: 'running',
        model: null,
        analyzedAt: null,
        failureReason: null,
        attemptCount: 0
      }
    });
    const view = render(<App />);
    await screen.findByRole('heading', { name: 'ประชุมทีม' }, { timeout: 3_000 });
    view.unmount();
    expect(clear).toHaveBeenCalledWith(7);
  });

  it('keeps the latest meeting visible when one polling request fails', async () => {
    let poll: (() => void) | undefined;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback) => {
      if (typeof callback === 'function') poll = callback;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'm@example.com', displayName: 'Member', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({
      items: [
        {
          id: 'm1',
          workspaceId: 'w',
          title: 'ประชุมทีม',
          source: 'google-meet-caption',
          startedAt: '2026-01-01T00:00:00Z',
          endedAt: '2026-01-01T00:01:00Z',
          createdAt: '2026-01-01T00:01:00Z',
          updatedAt: '2026-01-01T00:01:00Z',
          segmentCount: 0,
          analysisStatus: 'running'
        }
      ],
      nextCursor: null
    });
    vi.mocked(api.meeting).mockResolvedValueOnce({
      id: 'm1',
      workspaceId: 'w',
      title: 'ประชุมทีม',
      source: 'google-meet-caption',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      createdAt: '2026-01-01T00:01:00Z',
      updatedAt: '2026-01-01T00:01:00Z',
      segments: [],
      speakerStats: [],
      analysis: {
        id: 'a',
        status: 'running',
        model: null,
        analyzedAt: null,
        failureReason: null,
        attemptCount: 0
      }
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'ประชุมทีม' })).toBeInTheDocument();
    vi.mocked(api.meeting).mockRejectedValueOnce(new Error('network offline'));

    await act(async () => {
      poll?.();
      await Promise.resolve();
    });

    expect(await screen.findByText(/อัปเดตสถานะล่าสุดไม่สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ประชุมทีม' })).toBeInTheDocument();
  });

  it('shows member loading and prevents duplicate add requests', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'owner', email: 'owner@example.com', displayName: 'Owner', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'owner' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    let finishMembers: (value: { items: [] }) => void = () => undefined;
    vi.mocked(api.members)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishMembers = resolve;
          })
      )
      .mockResolvedValue({ items: [] });
    let finishAdd: () => void = () => undefined;
    vi.mocked(api.addMember).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAdd = () => resolve({} as never);
        })
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: th.members }));
    expect(screen.getByText('กำลังโหลดสมาชิก…')).toBeInTheDocument();
    await act(async () => finishMembers({ items: [] }));
    expect(
      screen.getByLabelText('สิทธิ์').querySelector('option[value="owner"]')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'new@example.com' } });
    const addButton = screen.getByRole('button', { name: 'เพิ่มสมาชิก' });
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    expect(api.addMember).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'กำลังเพิ่ม…' })).toBeDisabled();
    await act(async () => finishAdd());
    expect(await screen.findByText('เพิ่มสมาชิกแล้ว')).toBeInTheDocument();
    vi.mocked(api.addMember).mockRejectedValueOnce(new Error('เพิ่มไม่สำเร็จ'));
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'fail@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มสมาชิก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('เพิ่มไม่สำเร็จ');
  });

  it('keeps canonical roles and only disables the member row being updated', async () => {
    const members = [
      {
        id: '1',
        userId: 'u1',
        email: 'one@example.com',
        displayName: 'One',
        status: 'active',
        role: 'member' as const
      },
      {
        id: '2',
        userId: 'u2',
        email: 'two@example.com',
        displayName: 'Two',
        status: 'active',
        role: 'viewer' as const
      }
    ];
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'owner', email: 'owner@example.com', displayName: 'Owner', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'owner' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(api.members).mockResolvedValue({ items: members });
    let failUpdate: (reason: Error) => void = () => undefined;
    vi.mocked(api.updateMember).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          failUpdate = reject;
        })
    );
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: th.members }));
    const first = await screen.findByLabelText('สิทธิ์ของ one@example.com');
    const second = screen.getByLabelText('สิทธิ์ของ two@example.com');
    fireEvent.change(first, { target: { value: 'admin' } });
    expect(first).toBeDisabled();
    expect(second).toBeEnabled();
    await act(async () => failUpdate(new Error('ไม่มีสิทธิ์ (403)')));
    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่มีสิทธิ์');
    expect(first).toHaveValue('member');
    expect(first).toBeEnabled();
    vi.mocked(api.updateMember).mockResolvedValueOnce({ ...members[0], role: 'admin' });
    vi.mocked(api.members).mockResolvedValueOnce({
      items: [{ ...members[0], role: 'admin' }, members[1]]
    });
    fireEvent.change(first, { target: { value: 'admin' } });
    expect(await screen.findByText('อัปเดตสิทธิ์ของ one@example.com แล้ว')).toBeInTheDocument();
    expect(screen.getByLabelText('สิทธิ์ของ one@example.com')).toHaveValue('admin');
  });

  it('does not offer owner assignment or owner changes to admins', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'admin', email: 'admin@example.com', displayName: 'Admin', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'admin' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(api.members).mockResolvedValue({
      items: [
        {
          id: '1',
          userId: 'owner',
          email: 'owner@example.com',
          displayName: 'Owner',
          status: 'active',
          role: 'owner'
        }
      ]
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: th.members }));
    const addRole = await screen.findByLabelText('สิทธิ์');
    expect(addRole.querySelector('option[value="owner"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText('สิทธิ์ของ owner@example.com')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ลบ owner@example.com' })).toBeDisabled();
  });

  it('keeps a member visible when deletion fails', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'owner', email: 'owner@example.com', displayName: 'Owner', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'owner' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(api.members).mockResolvedValue({
      items: [
        {
          id: '1',
          userId: 'u1',
          email: 'one@example.com',
          displayName: 'One',
          status: 'active',
          role: 'member'
        }
      ]
    });
    vi.mocked(api.removeMember).mockRejectedValue(new Error('ลบไม่สำเร็จ'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: th.members }));
    fireEvent.click(await screen.findByRole('button', { name: 'ลบ one@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(api.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ลบ one@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'ลบสมาชิก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ลบไม่สำเร็จ');
    expect(screen.getByText('one@example.com')).toBeInTheDocument();
    vi.mocked(api.removeMember).mockResolvedValueOnce(undefined as never);
    vi.mocked(api.members).mockResolvedValueOnce({ items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'ลบ one@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'ลบสมาชิก' }));
    expect(await screen.findByText('ลบ one@example.com ออกจาก workspace แล้ว')).toBeInTheDocument();
    expect(screen.queryByText('one@example.com')).not.toBeInTheDocument();
  });

  it('keeps the first page on pagination failure and retries without duplicates', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockImplementation(async (_workspace, _search, _speaker, cursor) => {
      if (!cursor) return { items: [meetingSummary('m1')], nextCursor: 'next' };
      throw new Error('โหลดหน้าถัดไปไม่สำเร็จ');
    });
    vi.mocked(api.meeting).mockResolvedValue({
      ...meetingSummary('m1'),
      segments: [],
      speakerStats: [],
      analysis: null
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Meeting m1' });
    fireEvent.click(screen.getByRole('button', { name: 'โหลดเพิ่มเติม' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดหน้าถัดไปไม่สำเร็จ');
    expect(screen.getByRole('heading', { name: 'Meeting m1' })).toBeInTheDocument();

    vi.mocked(api.meetings).mockImplementation(async (_workspace, _search, _speaker, cursor) =>
      cursor
        ? { items: [meetingSummary('m1'), meetingSummary('m2')], nextCursor: null }
        : { items: [meetingSummary('m1')], nextCursor: 'next' }
    );
    fireEvent.click(screen.getByRole('button', { name: 'ลองโหลดเพิ่มเติมอีกครั้ง' }));
    await screen.findByRole('button', { name: /Meeting m2/ });
    expect(screen.getAllByRole('button', { name: /Meeting m1/ })).toHaveLength(1);
  });

  it('ignores stale search responses and restores meetings after clearing search', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    let finishOldSearch: (value: { items: never[]; nextCursor: null }) => void = () => undefined;
    vi.mocked(api.meetings).mockImplementation(async (_workspace, search) => {
      if (search === 'old')
        return new Promise((resolve) => {
          finishOldSearch = resolve;
        });
      if (search === 'new') return { items: [], nextCursor: null };
      return { items: [meetingSummary('m1')], nextCursor: null };
    });
    vi.mocked(api.meeting).mockResolvedValue({
      ...meetingSummary('m1'),
      segments: [],
      speakerStats: [],
      analysis: null
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Meeting m1' });
    const search = screen.getByPlaceholderText(th.search);
    fireEvent.change(search, { target: { value: 'old' } });
    await waitFor(() => expect(api.meetings).toHaveBeenCalledWith('w', 'old'));
    fireEvent.change(search, { target: { value: 'new' } });
    expect(await screen.findByText(/ไม่พบการประชุมที่ตรงกับ “new”/)).toBeInTheDocument();
    await act(async () => finishOldSearch({ items: [], nextCursor: null }));
    expect(screen.getByText(/ไม่พบการประชุมที่ตรงกับ “new”/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'ล้างคำค้นหา' }).at(-1)!);
    expect(await screen.findByRole('heading', { name: 'Meeting m1' })).toBeInTheDocument();
  });

  it('resets owner-only views and ignores old pagination after switching to a viewer workspace', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [
        { id: 'owner-w', name: 'Owner workspace', role: 'owner' },
        { id: 'viewer-w', name: 'Viewer workspace', role: 'viewer' }
      ]
    });
    let finishPage: (value: {
      items: ReturnType<typeof meetingSummary>[];
      nextCursor: null;
    }) => void = () => undefined;
    vi.mocked(api.meetings).mockImplementation(async (workspace, _search, _speaker, cursor) => {
      if (workspace === 'owner-w' && cursor)
        return new Promise((resolve) => {
          finishPage = resolve;
        });
      if (workspace === 'owner-w')
        return { items: [meetingSummary('owner', 'owner-w')], nextCursor: 'next' };
      return { items: [], nextCursor: null };
    });
    vi.mocked(api.meeting).mockResolvedValue({
      ...meetingSummary('owner', 'owner-w'),
      segments: [],
      speakerStats: [],
      analysis: null
    });
    vi.mocked(api.members).mockResolvedValue({ items: [] });
    render(<App />);
    await screen.findByRole('heading', { name: 'Meeting owner' });
    fireEvent.click(screen.getByRole('button', { name: 'โหลดเพิ่มเติม' }));
    fireEvent.click(screen.getByRole('button', { name: th.members }));
    await screen.findByRole('heading', { name: th.members });
    fireEvent.change(screen.getByLabelText('พื้นที่ทำงาน'), { target: { value: 'viewer-w' } });
    expect(
      await screen.findByRole('heading', { name: 'เริ่มบันทึกการประชุมครั้งแรก' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: th.members })).not.toBeInTheDocument();
    await act(async () =>
      finishPage({ items: [meetingSummary('stale', 'owner-w')], nextCursor: null })
    );
    expect(screen.queryByText('Meeting stale')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('พื้นที่ทำงาน'), { target: { value: 'owner-w' } });
    expect(await screen.findByRole('heading', { name: 'Meeting owner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: th.members })).toBeInTheDocument();
  });

  it('does not let an older meeting response replace the latest navigation', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({
      items: [meetingSummary('m1'), meetingSummary('m2')],
      nextCursor: null
    });
    let finishFirst: (meeting: Meeting) => void = () => undefined;
    vi.mocked(api.meeting).mockImplementation((_, id) =>
      id === 'm1'
        ? new Promise((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(fullMeeting('m2'))
    );
    render(<App />);
    await waitFor(() => expect(api.meeting).toHaveBeenCalledWith('w', 'm1'));
    fireEvent.click(screen.getByRole('button', { name: /Meeting m2/ }));
    expect(await screen.findByRole('heading', { name: 'Meeting m2' })).toBeInTheDocument();
    await act(async () => finishFirst(fullMeeting('m1')));
    expect(screen.getByRole('heading', { name: 'Meeting m2' })).toBeInTheDocument();
  });

  it('does not retain expanded topic details after navigating to another meeting', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({
      items: [meetingSummary('m1'), meetingSummary('m2')],
      nextCursor: null
    });
    const analyzed = (name: string) => ({
      id: 'a',
      status: 'completed' as const,
      model: null,
      analyzedAt: null,
      failureReason: null,
      attemptCount: 1,
      topics: [{ name, summary: `${name} detail`, speakers: [] }]
    });
    vi.mocked(api.meeting).mockImplementation((_, id) =>
      Promise.resolve(fullMeeting(id, analyzed(id === 'm1' ? 'Old topic' : 'New topic')))
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Meeting m1' });
    expect(
      screen.getByText('Old topic detail', { selector: '.topic-detail p' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Meeting m2/ }));
    await screen.findByRole('heading', { name: 'Meeting m2' });
    expect(screen.queryByText('Old topic detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New topic/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('moves a failed analysis through busy to the pending server state', async () => {
    vi.mocked(api.me).mockResolvedValue({
      user: { id: 'u', email: 'u@example.com', displayName: 'User', status: 'active' },
      workspaces: [{ id: 'w', name: 'Workspace', role: 'member' }]
    });
    vi.mocked(api.meetings).mockResolvedValue({ items: [meetingSummary('m1')], nextCursor: null });
    const failed = {
      id: 'a',
      status: 'failed' as const,
      model: null,
      analyzedAt: null,
      failureReason: 'ลองใหม่',
      attemptCount: 1
    };
    vi.mocked(api.meeting)
      .mockResolvedValueOnce(fullMeeting('m1', failed))
      .mockResolvedValueOnce(
        fullMeeting('m1', { ...failed, status: 'pending', failureReason: null })
      );
    let finishAnalyze: () => void = () => undefined;
    vi.mocked(api.analyze).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAnalyze = () => resolve(undefined);
        })
    );
    render(<App />);
    const retry = await screen.findByRole('button', { name: 'ลองอีกครั้ง' });
    fireEvent.click(retry);
    expect(screen.getByRole('button', { name: 'กำลังวิเคราะห์…' })).toBeDisabled();
    await act(async () => finishAnalyze());
    expect(await screen.findByText('รอคิววิเคราะห์')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'รอคิว…' })).toBeDisabled();
  });
});
