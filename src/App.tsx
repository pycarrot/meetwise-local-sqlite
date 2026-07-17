import { LogOut, Menu, Search, Settings2, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { MeetingHeader } from './components/MeetingHeader';
import { SpeakerBars } from './components/SpeakerBars';
import { SummaryPanel } from './components/SummaryPanel';
import { TopicTable } from './components/TopicTable';
import { Transcript } from './components/Transcript';
import { th } from './i18n/th';
import { api } from './lib/api';
import type {
  CurrentUser,
  Health,
  Meeting,
  MeetingSummary,
  Member,
  Workspace,
  WorkspaceRole
} from './types';

const mobileTabs = [
  { id: 'summary', label: 'สรุป' },
  { id: 'speakers', label: 'ผู้พูด' },
  { id: 'topics', label: 'ประเด็น' },
  { id: 'transcript', label: 'บทสนทนา' }
];

function confirmAction(message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    const text = document.createElement('p');
    text.textContent = message;
    const actions = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'ยกเลิก';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'danger-button';
    confirm.textContent = confirmLabel;
    actions.append(cancel, confirm);
    dialog.append(text, actions);
    document.body.append(dialog);
    const finish = (result: boolean) => {
      dialog.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  });
}

function Login({ onLogin }: { onLogin: (user: CurrentUser, workspaces: Workspace[]) => void }) {
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = registering
        ? await api.register(displayName, email, password, workspaceName)
        : await api.login(email, password);
      onLogin(result.user, result.workspaces);
    } catch (caught) {
      const status = (caught as Error & { status?: number }).status;
      setError(
        status === 401
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : status === 409
            ? 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ'
            : caught instanceof Error
              ? caught.message
              : 'เข้าสู่ระบบไม่สำเร็จ'
      );
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <BrandMark />
        <h1>{registering ? 'สมัครใช้งาน Meetwise' : th.loginTitle}</h1>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {registering && (
          <>
            <label>
              ชื่อที่แสดง
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                minLength={2}
                required
              />
            </label>
            <label>
              ชื่อ Workspace
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                minLength={2}
                required
              />
            </label>
          </>
        )}
        <label>
          {th.email}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          {th.password}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? 12 : undefined}
            required
          />
        </label>
        {registering && (
          <small className="form-hint">
            อย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข
          </small>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? th.loading : registering ? 'สมัครและสร้าง Workspace' : th.login}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegistering((value) => !value);
            setError('');
            setPassword('');
          }}
        >
          {registering ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี สมัครใช้งาน'}
        </button>
      </form>
    </main>
  );
}

function MemberAdmin({
  workspace,
  currentUser
}: {
  workspace: Workspace;
  currentUser: CurrentUser;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyMember, setBusyMember] = useState('');
  const roleLabels: Record<WorkspaceRole, string> = {
    owner: 'เจ้าของ',
    admin: 'ผู้ดูแล',
    member: 'สมาชิก',
    viewer: 'ผู้ดู'
  };
  const assignableRoles: WorkspaceRole[] =
    workspace.role === 'owner'
      ? ['owner', 'admin', 'member', 'viewer']
      : ['admin', 'member', 'viewer'];
  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoadingMembers(true);
      try {
        const result = await api.members(workspace.id);
        setMembers(result.items);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingMembers(false);
      }
    },
    [workspace.id]
  );
  useEffect(() => {
    api
      .members(workspace.id)
      .then((result) => setMembers(result.items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMembers(false));
  }, [workspace.id]);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setAdding(true);
    try {
      await api.addMember(workspace.id, email, role);
      setEmail('');
      await load();
      setSuccess('เพิ่มสมาชิกแล้ว');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }
  return (
    <section className="admin-panel" aria-labelledby="members-title">
      <h2 id="members-title">{th.members}</h2>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="success-banner" role="status">
          {success}
        </div>
      )}
      <form className="member-form" onSubmit={add}>
        <label>
          {th.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          สิทธิ์
          <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
            {assignableRoles.map((itemRole) => (
              <option key={itemRole} value={itemRole}>
                {roleLabels[itemRole]}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" disabled={adding}>
          {adding ? 'กำลังเพิ่ม…' : 'เพิ่มสมาชิก'}
        </button>
      </form>
      <div className="member-list">
        {loadingMembers && <div className="empty-state">กำลังโหลดสมาชิก…</div>}
        {!loadingMembers && !members.length && <div className="empty-state">ยังไม่มีสมาชิก</div>}
        {members.map((member) => (
          <div key={member.id}>
            <span>
              <strong>{member.displayName}</strong>
              <small>{member.email}</small>
            </span>
            <select
              aria-label={`สิทธิ์ของ ${member.email}`}
              value={member.role}
              disabled={
                busyMember === member.userId ||
                (member.role === 'owner' &&
                  (workspace.role !== 'owner' || member.userId === currentUser.id))
              }
              onChange={async (e) => {
                const nextRole = e.target.value as WorkspaceRole;
                if (
                  (member.role === 'owner' || nextRole === 'owner') &&
                  !(await confirmAction(
                    `เปลี่ยนสิทธิ์ของ ${member.displayName} (${member.email}) เป็น ${roleLabels[nextRole]} หรือไม่? การเปลี่ยนเจ้าของอาจกระทบสิทธิ์จัดการ workspace`,
                    'เปลี่ยนสิทธิ์'
                  ))
                )
                  return;
                setBusyMember(member.userId);
                setError('');
                setSuccess('');
                try {
                  await api.updateMember(workspace.id, member.userId, nextRole);
                  await load();
                  setSuccess(`อัปเดตสิทธิ์ของ ${member.email} แล้ว`);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusyMember('');
                }
              }}
            >
              {member.role === 'owner' && workspace.role !== 'owner' && (
                <option value="owner">{roleLabels.owner}</option>
              )}
              {assignableRoles.map((itemRole) => (
                <option key={itemRole} value={itemRole}>
                  {roleLabels[itemRole]}
                </option>
              ))}
            </select>
            <button
              aria-label={`ลบ ${member.email}`}
              disabled={
                busyMember === member.userId ||
                member.userId === currentUser.id ||
                (member.role === 'owner' && workspace.role !== 'owner')
              }
              onClick={async () => {
                if (
                  !(await confirmAction(
                    `ลบ ${member.displayName} (${member.email}) ออกจาก workspace หรือไม่? การลบนี้เกิดบนเซิร์ฟเวอร์และต้องเพิ่มสมาชิกใหม่หากต้องการกู้คืนสิทธิ์`,
                    'ลบสมาชิก'
                  ))
                )
                  return;
                setBusyMember(member.userId);
                setError('');
                setSuccess('');
                try {
                  await api.removeMember(workspace.id, member.userId);
                  await load();
                  setSuccess(`ลบ ${member.email} ออกจาก workspace แล้ว`);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusyMember('');
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<CurrentUser>();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState('');
  const [meeting, setMeeting] = useState<Meeting>();
  const [health, setHealth] = useState<Health>();
  const [healthError, setHealthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [mobileTab, setMobileTab] = useState('summary');
  const [mobileLayout, setMobileLayout] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<'meetings' | 'members' | 'settings'>('meetings');
  const [analyzing, setAnalyzing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const meetingRequest = useRef(0);
  const listRequest = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const mainContent = useRef<HTMLElement>(null);

  const establish = useCallback((nextUser: CurrentUser, nextWorkspaces: Workspace[]) => {
    setUser(nextUser);
    setWorkspaces(nextWorkspaces);
    setWorkspace(nextWorkspaces[0]);
    setLoading(false);
  }, []);
  useEffect(() => {
    api
      .me()
      .then((r) => establish(r.user, r.workspaces))
      .catch((caught: Error & { status?: number }) => {
        if (caught.status !== 401 && caught.status !== 403) setBootstrapError(caught.message);
        setLoading(false);
      });
  }, [establish, bootstrapAttempt]);
  const loadHealth = useCallback(async () => {
    setHealthError('');
    try {
      setHealth(await api.ready());
    } catch (caught) {
      setHealth(undefined);
      setHealthError((caught as Error).message);
    }
  }, []);
  useEffect(() => {
    api
      .ready()
      .then(setHealth)
      .catch((caught: Error) => setHealthError(caught.message));
  }, []);
  const loadMeeting = useCallback(
    async (id: string, background = false) => {
      if (!workspace) return;
      const request = ++meetingRequest.current;
      if (!background) {
        setLoading(true);
        setError('');
        setRefreshError('');
      }
      try {
        const next = await api.meeting(workspace.id, id);
        if (request !== meetingRequest.current) return;
        setMeeting(next);
        setRefreshError('');
        setSelectedTopic((current) =>
          current && next.analysis?.topics?.some((topic) => topic.name === current)
            ? current
            : next.analysis?.topics?.[0]?.name || ''
        );
        if (!background) {
          setView('meetings');
          setSidebarOpen(false);
        }
      } catch (e) {
        if (request !== meetingRequest.current) return;
        if (background) setRefreshError((e as Error).message);
        else setError((e as Error).message);
      } finally {
        if (!background && request === meetingRequest.current) setLoading(false);
      }
    },
    [workspace]
  );
  useEffect(() => {
    if (!workspace) return;
    const request = ++listRequest.current;
    const timer = setTimeout(() => {
      setMeetingsLoading(true);
      setPaginationError('');
      setNextCursor(null);
      void api
        .meetings(workspace.id, deferredQuery)
        .then((r) => {
          if (request !== listRequest.current) return;
          setMeetings(r.items);
          setNextCursor(r.nextCursor);
          if (r.items[0] && !r.items.some((m) => m.id === meeting?.id))
            void loadMeeting(r.items[0].id);
          if (!r.items.length) setMeeting(undefined);
        })
        .catch((e: Error) => {
          if (request === listRequest.current) setError(e.message);
        })
        .finally(() => {
          if (request === listRequest.current) setMeetingsLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [workspace, deferredQuery, loadMeeting, meeting?.id]);
  useEffect(() => {
    if (!meeting || !['pending', 'running'].includes(meeting.analysis?.status ?? '')) return;
    const timer = setInterval(() => void loadMeeting(meeting.id, true), 3_000);
    return () => clearInterval(timer);
  }, [meeting, loadMeeting]);
  useEffect(() => () => void ++meetingRequest.current, []);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setMobileLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButton.current;
    document.body.style.overflow = 'hidden';
    drawerClose.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      trigger?.focus();
    };
  }, [sidebarOpen]);
  useEffect(() => {
    const heading = mainContent.current?.querySelector<HTMLElement>('h1, h2');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [view, meeting?.id, workspace?.id]);
  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    setCreatingWorkspace(true);
    setError('');
    try {
      const created = await api.createWorkspace(newWorkspaceName);
      const next: Workspace = { ...created, role: 'owner' };
      setWorkspaces((current) => [...current, next]);
      setWorkspace(next);
      setNewWorkspaceName('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreatingWorkspace(false);
    }
  }
  if (loading && !user) return <div className="loading-screen">{th.loading}</div>;
  if (!user && bootstrapError)
    return (
      <main className="empty-page">
        <h1>เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ</h1>
        <p>{bootstrapError}</p>
        <button
          onClick={() => {
            setBootstrapError('');
            setLoading(true);
            setBootstrapAttempt((attempt) => attempt + 1);
          }}
        >
          ลองอีกครั้ง
        </button>
      </main>
    );
  if (!user) return <Login onLogin={establish} />;
  if (!workspace)
    return (
      <main className="empty-page">
        <h1>ยังไม่มี Workspace</h1>
        <p>สร้างพื้นที่ทำงานแรกของคุณ แล้วเริ่มใช้งานได้ทันที</p>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <form className="workspace-create-form" onSubmit={createWorkspace}>
          <label>
            ชื่อ Workspace
            <input
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              minLength={2}
              required
            />
          </label>
          <button className="primary-button" disabled={creatingWorkspace}>
            {creatingWorkspace ? 'กำลังสร้าง…' : 'สร้าง Workspace'}
          </button>
        </form>
        <button className="text-button" onClick={() => api.logout().then(() => setUser(undefined))}>
          {th.logout}
        </button>
      </main>
    );
  const workspaceId = workspace.id;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const canAnalyze = workspace.role !== 'viewer';
  const canDelete = workspace.role === 'owner' || workspace.role === 'admin';
  const topics = meeting?.analysis?.topics ?? [];
  async function loadMoreMeetings() {
    if (!nextCursor || loadingMore) return;
    const request = listRequest.current;
    setLoadingMore(true);
    setPaginationError('');
    try {
      const result = await api.meetings(workspaceId, deferredQuery, '', nextCursor);
      if (request !== listRequest.current) return;
      setMeetings((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        result.items.forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      });
      setNextCursor(result.nextCursor);
    } catch (e) {
      if (request === listRequest.current) setPaginationError((e as Error).message);
    } finally {
      if (request === listRequest.current) setLoadingMore(false);
    }
  }
  async function analyze() {
    if (!meeting) return;
    setAnalyzing(true);
    try {
      await api.analyze(workspaceId, meeting.id);
      await loadMeeting(meeting.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }
  return (
    <div className="app-shell">
      <button
        ref={menuButton}
        className="mobile-menu-button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="เปิดเมนู"
        aria-expanded={sidebarOpen}
        aria-controls="sidebar-drawer"
      >
        {sidebarOpen ? <X /> : <Menu />}
      </button>
      <div id="sidebar-drawer" className={`sidebar-drawer ${sidebarOpen ? 'open' : ''}`}>
        <aside className="sidebar">
          <div className="brand">
            <BrandMark />
            <span>{th.appName}</span>
            <button
              ref={drawerClose}
              className="drawer-close"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="ปิดเมนู"
            >
              <X size={20} />
            </button>
          </div>
          <div className="workspace-switch">
            <label>
              พื้นที่ทำงาน
              <select
                value={workspace.id}
                onChange={(e) => {
                  const next = workspaces.find((w) => w.id === e.target.value);
                  meetingRequest.current += 1;
                  listRequest.current += 1;
                  setWorkspace(next);
                  setMeeting(undefined);
                  setMeetings([]);
                  setNextCursor(null);
                  setQuery('');
                  setSelectedTopic('');
                  setMobileTab('summary');
                  setView('meetings');
                  setError('');
                  setRefreshError('');
                  setPaginationError('');
                  setSidebarOpen(false);
                }}
              >
                {workspaces.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <nav className="nav" aria-label="เมนูหลัก">
            <button
              className={`nav-item ${view === 'meetings' ? 'active' : ''}`}
              onClick={() => {
                setView('meetings');
                setSidebarOpen(false);
              }}
            >
              <Search size={19} />
              {th.meetings}
            </button>
            <label className="sidebar-search">
              <span className="sr-only">{th.search}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={th.search}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="ล้างคำค้นหา">
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="meeting-list">
              {meetings.map((item) => (
                <button
                  key={item.id}
                  className={`meeting-link ${meeting?.id === item.id ? 'selected' : ''}`}
                  onClick={() => void loadMeeting(item.id)}
                >
                  <span>{item.title}</span>
                  <small>
                    {item.segmentCount} ช่วง · {item.analysisStatus ?? 'ยังไม่วิเคราะห์'}
                  </small>
                </button>
              ))}
            </div>
            {meetingsLoading && <div className="meeting-list-status">กำลังค้นหา…</div>}
            {paginationError && (
              <div className="meeting-list-status" role="alert">
                {paginationError}
              </div>
            )}
            {nextCursor && (
              <button
                className="load-more-button"
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMoreMeetings()}
              >
                {loadingMore
                  ? 'กำลังโหลด…'
                  : paginationError
                    ? 'ลองโหลดเพิ่มเติมอีกครั้ง'
                    : 'โหลดเพิ่มเติม'}
              </button>
            )}
            {canManage && (
              <button
                className={`nav-item ${view === 'members' ? 'active' : ''}`}
                onClick={() => {
                  setView('members');
                  setSidebarOpen(false);
                }}
              >
                <Users size={19} />
                {th.members}
              </button>
            )}
            <button
              className={`nav-item ${view === 'settings' ? 'active' : ''}`}
              onClick={() => {
                setView('settings');
                setSidebarOpen(false);
              }}
            >
              <Settings2 size={19} />
              บัญชีและระบบ
            </button>
          </nav>
          <div className="sidebar-footer">
            <div className={`connection-card ${health?.ready ? 'online' : 'offline'}`}>
              <ShieldCheck size={16} />
              {health?.ready
                ? 'เซิร์ฟเวอร์พร้อม'
                : healthError
                  ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'
                  : health
                    ? 'ระบบบางส่วนยังไม่พร้อม'
                    : 'กำลังตรวจสอบ…'}
            </div>
            <button
              className="nav-item"
              onClick={async () => {
                setError('');
                try {
                  await api.logout();
                  setUser(undefined);
                } catch (caught) {
                  setError((caught as Error).message);
                }
              }}
            >
              <LogOut size={18} />
              {th.logout}
            </button>
          </div>
        </aside>
      </div>
      {sidebarOpen && (
        <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <main ref={mainContent} className="main-content">
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button type="button" onClick={() => setError('')} aria-label="ปิดข้อความผิดพลาด">
              <X size={16} />
            </button>
          </div>
        )}
        {refreshError && (
          <div className="error-banner" role="status">
            อัปเดตสถานะล่าสุดไม่สำเร็จ · {refreshError}
          </div>
        )}
        {view === 'members' && canManage ? (
          <MemberAdmin workspace={workspace} currentUser={user} />
        ) : view === 'settings' ? (
          <section className="admin-panel">
            <h1>บัญชีและระบบ</h1>
            <p>ตรวจสอบบัญชี สถานะระบบ และจัดการ session ที่เข้าสู่ระบบอยู่</p>
            <p>
              {user.displayName}
              <br />
              {user.email}
            </p>
            {canManage && health && (
              <dl className="health-list">
                <dt>ฐานข้อมูล</dt>
                <dd>{health.dependencies.database.ready ? 'พร้อมใช้งาน' : 'ยังไม่พร้อม'}</dd>
                <dt>ระบบวิเคราะห์</dt>
                <dd>
                  {health.dependencies.ollama.connected
                    ? `${health.dependencies.ollama.model} · ${health.dependencies.ollama.modelAvailable ? 'พร้อม' : 'ไม่พบโมเดล'}`
                    : 'ยังเชื่อมต่อไม่ได้'}
                </dd>
              </dl>
            )}
            <button type="button" onClick={() => void loadHealth()}>
              ตรวจสอบสถานะอีกครั้ง
            </button>
            <div className="workspace-create-section">
              <h2>สร้าง Workspace เพิ่ม</h2>
              <form className="workspace-create-form" onSubmit={createWorkspace}>
                <label>
                  ชื่อ Workspace
                  <input
                    value={newWorkspaceName}
                    onChange={(event) => setNewWorkspaceName(event.target.value)}
                    minLength={2}
                    required
                  />
                </label>
                <button className="primary-button" disabled={creatingWorkspace}>
                  {creatingWorkspace ? 'กำลังสร้าง…' : 'สร้าง Workspace'}
                </button>
              </form>
            </div>
            <div className="danger-zone">
              <h2>การดำเนินการที่มีผลกระทบสูง</h2>
              <p>ยกเลิก session ของบัญชีนี้บนทุกอุปกรณ์และบังคับให้เข้าสู่ระบบใหม่</p>
              <button
                className="danger-button"
                disabled={revoking}
                onClick={async () => {
                  if (
                    !(await confirmAction(
                      'ยกเลิก session ทั้งหมดหรือไม่? ทุกอุปกรณ์จะออกจากระบบทันทีและต้องเข้าสู่ระบบใหม่ การกระทำนี้เกิดบนเซิร์ฟเวอร์และย้อนกลับไม่ได้',
                      'ยกเลิก session ทั้งหมด'
                    ))
                  )
                    return;
                  setRevoking(true);
                  setError('');
                  try {
                    await api.revokeAll();
                    setUser(undefined);
                  } catch (caught) {
                    setError((caught as Error).message);
                  } finally {
                    setRevoking(false);
                  }
                }}
              >
                {revoking ? 'กำลังยกเลิก…' : 'ยกเลิก session ทั้งหมด'}
              </button>
            </div>
          </section>
        ) : (
          <>
            {loading && <div className="loading-screen">{th.loading}</div>}
            {!loading && !meeting && !meetingsLoading && (
              <div className="empty-state page-empty">
                {deferredQuery ? (
                  <>
                    ไม่พบการประชุมที่ตรงกับ “{deferredQuery}”
                    <button type="button" onClick={() => setQuery('')}>
                      ล้างคำค้นหา
                    </button>
                  </>
                ) : (
                  <>
                    <h2>เริ่มบันทึกการประชุมครั้งแรก</h2>
                    <ol>
                      <li>เปิดหรือติดตั้ง Extension</li>
                      <li>เปิด Google Meet และเปิดคำบรรยาย</li>
                      <li>กดเริ่มบันทึกใน Extension</li>
                      <li>เมื่อประชุมจบ ให้กดหยุดและส่ง</li>
                    </ol>
                  </>
                )}
              </div>
            )}
            {!loading && meeting && (
              <>
                <MeetingHeader
                  meeting={meeting}
                  analyzing={analyzing}
                  onAnalyze={analyze}
                  canAnalyze={canAnalyze}
                  canDelete={canDelete}
                  onDelete={async () => {
                    if (
                      !(await confirmAction(
                        `ลบการประชุม “${meeting.title}” หรือไม่? ข้อมูลบนเซิร์ฟเวอร์จะถูกลบและกู้คืนไม่ได้`,
                        'ลบการประชุม'
                      ))
                    )
                      return;
                    try {
                      await api.deleteMeeting(workspaceId, meeting.id);
                      setMeeting(undefined);
                      const result = await api.meetings(workspaceId, deferredQuery);
                      setMeetings(result.items);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
                <div
                  className="mobile-tabs"
                  role={mobileLayout ? 'tablist' : undefined}
                  aria-label={mobileLayout ? 'ส่วนข้อมูลการประชุม' : undefined}
                >
                  {mobileTabs.map((tab, index) => (
                    <button
                      key={tab.id}
                      id={`meeting-tab-${tab.id}`}
                      className={mobileTab === tab.id ? 'active' : ''}
                      onClick={() => setMobileTab(tab.id)}
                      onKeyDown={(event) => {
                        let next = index;
                        if (event.key === 'ArrowRight') next = (index + 1) % mobileTabs.length;
                        else if (event.key === 'ArrowLeft')
                          next = (index - 1 + mobileTabs.length) % mobileTabs.length;
                        else if (event.key === 'Home') next = 0;
                        else if (event.key === 'End') next = mobileTabs.length - 1;
                        else return;
                        event.preventDefault();
                        setMobileTab(mobileTabs[next].id);
                        document.getElementById(`meeting-tab-${mobileTabs[next].id}`)?.focus();
                      }}
                      role={mobileLayout ? 'tab' : undefined}
                      aria-selected={mobileLayout ? mobileTab === tab.id : undefined}
                      aria-controls={mobileLayout ? `meeting-panel-${tab.id}` : undefined}
                      tabIndex={mobileLayout ? (mobileTab === tab.id ? 0 : -1) : undefined}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="dashboard-grid">
                  <div
                    id="meeting-panel-summary"
                    className={`summary-slot mobile-section ${mobileTab === 'summary' ? 'mobile-active' : ''}`}
                    role={mobileLayout ? 'tabpanel' : undefined}
                    aria-labelledby={mobileLayout ? 'meeting-tab-summary' : undefined}
                  >
                    <SummaryPanel analysis={meeting.analysis} source={meeting.source} />
                  </div>
                  <div
                    id="meeting-panel-speakers"
                    className={`speakers-slot mobile-section ${mobileTab === 'speakers' ? 'mobile-active' : ''}`}
                    role={mobileLayout ? 'tabpanel' : undefined}
                    aria-labelledby={mobileLayout ? 'meeting-tab-speakers' : undefined}
                  >
                    <SpeakerBars speakers={meeting.speakerStats} />
                  </div>
                  <div
                    id="meeting-panel-topics"
                    className={`topics-slot mobile-section ${mobileTab === 'topics' ? 'mobile-active' : ''}`}
                    role={mobileLayout ? 'tabpanel' : undefined}
                    aria-labelledby={mobileLayout ? 'meeting-tab-topics' : undefined}
                  >
                    <TopicTable
                      topics={topics}
                      speakers={meeting.speakerStats}
                      selectedTopic={selectedTopic}
                      onSelect={setSelectedTopic}
                    />
                  </div>
                  <div
                    id="meeting-panel-transcript"
                    className={`transcript-slot mobile-section ${mobileTab === 'transcript' ? 'mobile-active' : ''}`}
                    role={mobileLayout ? 'tabpanel' : undefined}
                    aria-labelledby={mobileLayout ? 'meeting-tab-transcript' : undefined}
                  >
                    <Transcript segments={meeting.segments} speakers={meeting.speakerStats} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
