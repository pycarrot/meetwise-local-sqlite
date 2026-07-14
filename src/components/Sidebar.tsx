import { BarChart3, CalendarDays, ExternalLink, Settings2 } from 'lucide-react';
import type { Health, MeetingSummary } from '../types';
import { BrandMark } from './BrandMark';

type SidebarProps = {
  meetings: MeetingSummary[];
  selectedId?: string;
  health?: Health;
  onSelect: (id: string) => void;
};

export function Sidebar({ meetings, selectedId, health, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <span>Meetwise Local</span>
      </div>
      <nav className="nav" aria-label="เมนูหลัก">
        <button className="nav-item active" type="button">
          <BarChart3 size={20} />
          ภาพรวม
        </button>
        <div className="nav-section-label">
          <CalendarDays size={17} />
          การประชุม
        </div>
        <div className="meeting-list">
          {meetings.map((meeting) => (
            <button
              className={`meeting-link ${selectedId === meeting.id ? 'selected' : ''}`}
              key={meeting.id}
              onClick={() => onSelect(meeting.id)}
              type="button"
            >
              <span>{meeting.title}</span>
              <small>{meeting.segmentCount} ช่วงคำพูด</small>
            </button>
          ))}
        </div>
        <button className="nav-item" type="button">
          <Settings2 size={20} />
          ตั้งค่า Ollama
        </button>
      </nav>
      <div className="sidebar-footer">
        <div className={`connection-card ${health?.ollama.connected ? 'online' : 'offline'}`}>
          <div>
            <span className="status-dot" />
            {health?.ollama.connected ? 'Ollama พร้อมใช้งาน' : 'Ollama ยังไม่เชื่อมต่อ'}
          </div>
          <small>โมเดล: {health?.ollama.model || 'llama3.2'}</small>
          <small>http://127.0.0.1:11434</small>
        </div>
        <div className="extension-card">
          <ExternalLink size={20} />
          <div>
            <strong>ส่วนขยาย Meetwise</strong>
            <small>จับคำบรรยายจาก Google Meet</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
