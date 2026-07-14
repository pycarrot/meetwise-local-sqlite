import { CalendarDays, Clock3, RotateCw, Users } from 'lucide-react';
import { formatClock, formatDate, formatDuration } from '../lib/format';
import type { Meeting } from '../types';

type MeetingHeaderProps = {
  meeting: Meeting;
  analyzing: boolean;
  onAnalyze: () => void;
};

export function MeetingHeader({ meeting, analyzing, onAnalyze }: MeetingHeaderProps) {
  const duration = new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime();
  return (
    <header className="meeting-header">
      <div>
        <div className="title-row">
          <h1>{meeting.title}</h1>
          <span className={`analysis-status ${meeting.analysis ? 'done' : ''}`}>
            {meeting.analysis ? 'วิเคราะห์แล้ว' : 'รอการวิเคราะห์'}
          </span>
        </div>
        <div className="meeting-meta">
          <span>
            <CalendarDays size={17} />
            {formatDate(meeting.startedAt)}
          </span>
          <span>
            <Clock3 size={17} />
            {formatClock(meeting.startedAt)} · {formatDuration(duration)}
          </span>
          <span>
            <Users size={17} />
            {meeting.speakerStats.length} คน
          </span>
        </div>
      </div>
      <button className="primary-button" type="button" onClick={onAnalyze} disabled={analyzing}>
        <RotateCw size={18} className={analyzing ? 'spinning' : ''} />
        {analyzing ? 'กำลังวิเคราะห์…' : 'วิเคราะห์ใหม่'}
      </button>
    </header>
  );
}
