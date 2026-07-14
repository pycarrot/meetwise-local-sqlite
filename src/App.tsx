import { Menu, Monitor, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { MeetingHeader } from './components/MeetingHeader';
import { Sidebar } from './components/Sidebar';
import { SpeakerBars } from './components/SpeakerBars';
import { SummaryPanel } from './components/SummaryPanel';
import { TopicTable } from './components/TopicTable';
import { Transcript } from './components/Transcript';
import { api } from './lib/api';
import type { Health, Meeting, MeetingSummary } from './types';

const mobileTabs = [
  { id: 'summary', label: 'สรุป' },
  { id: 'speakers', label: 'ผู้พูด' },
  { id: 'topics', label: 'ประเด็น' },
  { id: 'transcript', label: 'บทสนทนา' }
];

export default function App() {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [meeting, setMeeting] = useState<Meeting>();
  const [health, setHealth] = useState<Health>();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [mobileTab, setMobileTab] = useState('summary');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadMeeting = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const nextMeeting = await api.meeting(id);
      setMeeting(nextMeeting);
      setSelectedTopic(nextMeeting.analysis?.topics[0]?.name || '');
      setSidebarOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดการประชุมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([api.meetings(), api.health()])
      .then(([meetingList, nextHealth]) => {
        setMeetings(meetingList);
        setHealth(nextHealth);
        if (meetingList[0]) return loadMeeting(meetingList[0].id);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
        setLoading(false);
      });
  }, [loadMeeting]);

  const analyze = async () => {
    if (!meeting) return;
    setAnalyzing(true);
    setError('');
    try {
      const updated = await api.analyze(meeting.id);
      setMeeting(updated);
      setSelectedTopic(updated.analysis?.topics[0]?.name || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'วิเคราะห์ไม่สำเร็จ');
    } finally {
      setAnalyzing(false);
    }
  };

  const topics = meeting?.analysis?.topics || [];

  return (
    <div className="app-shell">
      <button
        className="mobile-menu-button"
        onClick={() => setSidebarOpen((open) => !open)}
        type="button"
        aria-label="เปิดเมนู"
      >
        {sidebarOpen ? <X /> : <Menu />}
      </button>
      <div className={`sidebar-drawer ${sidebarOpen ? 'open' : ''}`}>
        <Sidebar
          meetings={meetings}
          selectedId={meeting?.id}
          health={health}
          onSelect={loadMeeting}
        />
      </div>
      {sidebarOpen && (
        <button
          className="scrim"
          onClick={() => setSidebarOpen(false)}
          type="button"
          aria-label="ปิดเมนู"
        />
      )}
      <main className="main-content">
        <div className="topline">
          <strong className="mobile-brand-name">Meetwise Local</strong>
          <span>
            <Monitor size={16} />
            <span className="privacy-copy">ข้อมูลอยู่ในเครื่องของคุณ</span>
          </span>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {loading && (
          <div className="loading-screen">
            <span className="loading-ring" />
            กำลังโหลดการประชุม…
          </div>
        )}
        {!loading && meeting && (
          <>
            <MeetingHeader meeting={meeting} analyzing={analyzing} onAnalyze={analyze} />
            <div className="mobile-tabs" role="tablist" aria-label="ส่วนของรายงาน">
              {mobileTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={mobileTab === tab.id ? 'active' : ''}
                  onClick={() => setMobileTab(tab.id)}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab.id}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="dashboard-grid">
              <div
                id="summary"
                className={`summary-slot mobile-section ${mobileTab === 'summary' ? 'mobile-active' : ''}`}
              >
                <SummaryPanel analysis={meeting.analysis} />
              </div>
              <div
                id="speakers"
                className={`speakers-slot mobile-section ${mobileTab === 'speakers' ? 'mobile-active' : ''}`}
              >
                <SpeakerBars speakers={meeting.speakerStats} />
              </div>
              <div
                id="topics"
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
                id="transcript"
                className={`transcript-slot mobile-section ${mobileTab === 'transcript' ? 'mobile-active' : ''}`}
              >
                <Transcript segments={meeting.segments} speakers={meeting.speakerStats} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
