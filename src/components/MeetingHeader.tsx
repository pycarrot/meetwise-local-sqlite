import { CalendarDays, Clock3, RotateCw, Trash2, Users } from 'lucide-react';
import { formatClock, formatDate, formatDuration } from '../lib/format';
import type { Meeting } from '../types';

type MeetingHeaderProps = {
  meeting: Meeting;
  analyzing: boolean;
  onAnalyze: () => void;
  canAnalyze?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
};

export function MeetingHeader({
  meeting,
  analyzing,
  onAnalyze,
  canAnalyze = true,
  canDelete = false,
  onDelete
}: MeetingHeaderProps) {
  const duration = new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime();
  return (
    <header className="meeting-header">
      <div>
        <div className="title-row">
          <h1>{meeting.title}</h1>
          <span
            className={`analysis-status ${meeting.analysis?.status === 'completed' ? 'done' : ''}`}
          >
            {meeting.analysis?.status === 'completed'
              ? 'วิเคราะห์แล้ว'
              : meeting.analysis?.status === 'failed'
                ? 'วิเคราะห์ล้มเหลว'
                : meeting.analysis?.status === 'running'
                  ? 'กำลังวิเคราะห์'
                  : 'รอการวิเคราะห์'}
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
      <div className="header-actions">
        {canDelete && (
          <button
            className="icon-danger-button"
            type="button"
            onClick={onDelete}
            aria-label="ลบการประชุม"
          >
            <Trash2 size={18} />
          </button>
        )}
        {canAnalyze && (
          <button
            className="primary-button"
            type="button"
            onClick={onAnalyze}
            disabled={
              analyzing ||
              meeting.analysis?.status === 'running' ||
              meeting.analysis?.status === 'pending'
            }
          >
            <RotateCw size={18} className={analyzing ? 'spinning' : ''} />
            {analyzing
              ? 'กำลังวิเคราะห์…'
              : meeting.analysis?.status === 'failed'
                ? 'ลองวิเคราะห์ใหม่'
                : 'วิเคราะห์ใหม่'}
          </button>
        )}
      </div>
    </header>
  );
}
