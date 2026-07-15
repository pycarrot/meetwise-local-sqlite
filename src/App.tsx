import { LogOut, Menu, Search, Settings2, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';
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

function Login({ onLogin }: { onLogin: (user: CurrentUser, workspaces: Workspace[]) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(email, password);
      onLogin(result.user, result.workspaces);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <BrandMark />
        <h1>{th.loginTitle}</h1>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
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
            autoComplete="current-password"
            required
          />
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? th.loading : th.login}
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
  const load = useCallback(
    () =>
      api
        .members(workspace.id)
        .then((r) => setMembers(r.items))
        .catch((e: Error) => setError(e.message)),
    [workspace.id]
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.addMember(workspace.id, email, role);
      setEmail('');
      await load();
    } catch (e) {
      setError((e as Error).message);
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
      <form className="member-form" onSubmit={add}>
        <label>
          {th.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          สิทธิ์
          <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
            {['admin', 'member', 'viewer', ...(workspace.role === 'owner' ? ['owner'] : [])].map(
              (r) => (
                <option key={r}>{r}</option>
              )
            )}
          </select>
        </label>
        <button className="primary-button">เพิ่มสมาชิก</button>
      </form>
      <div className="member-list">
        {members.map((member) => (
          <div key={member.id}>
            <span>
              <strong>{member.displayName}</strong>
              <small>{member.email}</small>
            </span>
            <select
              aria-label={`สิทธิ์ของ ${member.email}`}
              value={member.role}
              disabled={member.userId === currentUser.id && member.role === 'owner'}
              onChange={async (e) => {
                try {
                  await api.updateMember(
                    workspace.id,
                    member.userId,
                    e.target.value as WorkspaceRole
                  );
                  await load();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              {['owner', 'admin', 'member', 'viewer'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <button
              aria-label={`ลบ ${member.email}`}
              disabled={member.userId === currentUser.id}
              onClick={async () => {
                try {
                  await api.removeMember(workspace.id, member.userId);
                  await load();
                } catch (e) {
                  setError((e as Error).message);
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
  const [meeting, setMeeting] = useState<Meeting>();
  const [health, setHealth] = useState<Health>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [mobileTab, setMobileTab] = useState('summary');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<'meetings' | 'members' | 'settings'>('meetings');
  const [analyzing, setAnalyzing] = useState(false);

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
      .catch(() => setLoading(false));
  }, [establish]);
  useEffect(() => {
    api
      .ready()
      .then(setHealth)
      .catch(() => undefined);
  }, []);
  const loadMeeting = useCallback(
    async (id: string) => {
      if (!workspace) return;
      setLoading(true);
      setError('');
      try {
        const next = await api.meeting(workspace.id, id);
        setMeeting(next);
        setSelectedTopic(next.analysis?.topics?.[0]?.name || '');
        setView('meetings');
        setSidebarOpen(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [workspace]
  );
  useEffect(() => {
    if (!workspace) return;
    const timer = setTimeout(
      () =>
        api
          .meetings(workspace.id, deferredQuery)
          .then((r) => {
            setMeetings(r.items);
            if (r.items[0] && !r.items.some((m) => m.id === meeting?.id))
              void loadMeeting(r.items[0].id);
            if (!r.items.length) setMeeting(undefined);
          })
          .catch((e: Error) => setError(e.message)),
      250
    );
    return () => clearTimeout(timer);
  }, [workspace, deferredQuery, loadMeeting, meeting?.id]);
  useEffect(() => {
    if (!meeting || !['pending', 'running'].includes(meeting.analysis?.status ?? '')) return;
    const timer = setInterval(() => void loadMeeting(meeting.id), 3_000);
    return () => clearInterval(timer);
  }, [meeting, loadMeeting]);
  if (loading && !user) return <div className="loading-screen">{th.loading}</div>;
  if (!user) return <Login onLogin={establish} />;
  if (!workspace)
    return (
      <main className="empty-page">
        <h1>ยังไม่มี Workspace</h1>
        <p>ให้ผู้ดูแลเพิ่มบัญชีนี้ใน workspace ก่อน</p>
        <button onClick={() => api.logout().then(() => setUser(undefined))}>{th.logout}</button>
      </main>
    );
  const workspaceId = workspace.id;
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const canAnalyze = workspace.role !== 'viewer';
  const canDelete = workspace.role === 'owner' || workspace.role === 'admin';
  const topics = meeting?.analysis?.topics ?? [];
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
        className="mobile-menu-button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="เปิดเมนู"
      >
        {sidebarOpen ? <X /> : <Menu />}
      </button>
      <div className={`sidebar-drawer ${sidebarOpen ? 'open' : ''}`}>
        <aside className="sidebar">
          <div className="brand">
            <BrandMark />
            <span>{th.appName}</span>
          </div>
          <div className="workspace-switch">
            <label>
              Workspace
              <select
                value={workspace.id}
                onChange={(e) => {
                  const next = workspaces.find((w) => w.id === e.target.value);
                  setWorkspace(next);
                  setMeeting(undefined);
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
              onClick={() => setView('meetings')}
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
            {canManage && (
              <button
                className={`nav-item ${view === 'members' ? 'active' : ''}`}
                onClick={() => setView('members')}
              >
                <Users size={19} />
                {th.members}
              </button>
            )}
            <button
              className={`nav-item ${view === 'settings' ? 'active' : ''}`}
              onClick={() => setView('settings')}
            >
              <Settings2 size={19} />
              บัญชีและระบบ
            </button>
          </nav>
          <div className="sidebar-footer">
            <div className={`connection-card ${health?.ready ? 'online' : 'offline'}`}>
              <ShieldCheck size={16} /> {health?.ready ? 'Server พร้อม' : 'Dependency ยังไม่พร้อม'}
            </div>
            <button
              className="nav-item"
              onClick={() => api.logout().finally(() => setUser(undefined))}
            >
              <LogOut size={18} />
              {th.logout}
            </button>
          </div>
        </aside>
      </div>
      {sidebarOpen && (
        <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู" />
      )}
      <main className="main-content">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {view === 'members' && canManage ? (
          <MemberAdmin workspace={workspace} currentUser={user} />
        ) : view === 'settings' ? (
          <section className="admin-panel">
            <h1>บัญชีและระบบ</h1>
            <p>
              {user.displayName}
              <br />
              {user.email}
            </p>
            {canManage && health && (
              <dl>
                <dt>Database</dt>
                <dd>{health.dependencies.database.ready ? 'พร้อม' : 'ไม่พร้อม'}</dd>
                <dt>Ollama</dt>
                <dd>
                  {health.dependencies.ollama.connected
                    ? `${health.dependencies.ollama.model} · ${health.dependencies.ollama.modelAvailable ? 'พร้อม' : 'ไม่พบโมเดล'}`
                    : 'offline'}
                </dd>
              </dl>
            )}
            <button
              className="danger-button"
              onClick={() => api.revokeAll().finally(() => setUser(undefined))}
            >
              ยกเลิก session ทั้งหมด
            </button>
          </section>
        ) : (
          <>
            {loading && <div className="loading-screen">{th.loading}</div>}
            {!loading && !meeting && (
              <div className="empty-state page-empty">{th.emptyMeetings}</div>
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
                    if (!confirm('ลบการประชุมนี้หรือไม่?')) return;
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
                <div className="mobile-tabs" role="tablist">
                  {mobileTabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={mobileTab === tab.id ? 'active' : ''}
                      onClick={() => setMobileTab(tab.id)}
                      role="tab"
                      aria-selected={mobileTab === tab.id}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="dashboard-grid">
                  <div
                    className={`summary-slot mobile-section ${mobileTab === 'summary' ? 'mobile-active' : ''}`}
                  >
                    <SummaryPanel analysis={meeting.analysis} />
                  </div>
                  <div
                    className={`speakers-slot mobile-section ${mobileTab === 'speakers' ? 'mobile-active' : ''}`}
                  >
                    <SpeakerBars speakers={meeting.speakerStats} />
                  </div>
                  <div
                    className={`topics-slot mobile-section ${mobileTab === 'topics' ? 'mobile-active' : ''}`}
                  >
                    <TopicTable
                      topics={topics}
                      speakers={meeting.speakerStats}
                      selectedTopic={selectedTopic}
                      onSelect={setSelectedTopic}
                    />
                  </div>
                  <div
                    className={`transcript-slot mobile-section ${mobileTab === 'transcript' ? 'mobile-active' : ''}`}
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
