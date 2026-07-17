// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeetingHeader } from './MeetingHeader';
import { SpeakerBars } from './SpeakerBars';
import { SummaryPanel } from './SummaryPanel';
import { TopicTable } from './TopicTable';
import type { Analysis, Meeting } from '../types';

const analysis: Analysis = {
  id: 'a',
  status: 'completed',
  model: 'model',
  analyzedAt: null,
  failureReason: null,
  attemptCount: 1,
  summary: ['สรุปหลัก'],
  decisions: ['อนุมัติแผน'],
  actionItems: [{ task: 'ส่งรายงาน', owner: 'เอ', due: '' }]
};

afterEach(cleanup);

describe('analysis presentation', () => {
  it('shows summary, decisions, and action items without empty metadata labels', () => {
    render(<SummaryPanel analysis={analysis} />);
    expect(screen.getByText('สรุปหลัก')).toBeInTheDocument();
    expect(screen.getByText('อนุมัติแผน')).toBeInTheDocument();
    expect(screen.getByText('ส่งรายงาน')).toBeInTheDocument();
    expect(screen.getByText('ผู้รับผิดชอบ: เอ')).toBeInTheDocument();
    expect(screen.queryByText(/กำหนด:/)).not.toBeInTheDocument();
  });

  it('does not show empty decision or action headings for summary-only analysis', () => {
    render(
      <SummaryPanel analysis={{ ...analysis, decisions: undefined, actionItems: undefined }} />
    );
    expect(screen.getByText('สรุปหลัก')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'มติ/การตัดสินใจ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'งานที่ต้องทำ' })).not.toBeInTheDocument();
  });

  it('expands and collapses topic contributions', () => {
    const onSelect = vi.fn();
    const topic = {
      name: 'งบประมาณ',
      summary: 'ทบทวนงบ',
      speakers: [{ name: 'เอ', contribution: 'เสนอให้ลดค่าใช้จ่าย' }]
    };
    const { rerender } = render(
      <TopicTable topics={[topic]} speakers={[]} selectedTopic="" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByRole('button', { name: /งบประมาณ/ }));
    expect(onSelect).toHaveBeenCalledWith('งบประมาณ');
    rerender(
      <TopicTable topics={[topic]} speakers={[]} selectedTopic="งบประมาณ" onSelect={onSelect} />
    );
    expect(screen.getByText('เสนอให้ลดค่าใช้จ่าย')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /งบประมาณ/ }));
    expect(onSelect).toHaveBeenLastCalledWith('');
  });

  it('expands a topic without speakers safely', () => {
    render(
      <TopicTable
        topics={[{ name: 'ทั่วไป', summary: 'รายละเอียด', speakers: [] }]}
        speakers={[]}
        selectedTopic="ทั่วไป"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('รายละเอียด', { selector: '.topic-detail p' })).toBeInTheDocument();
  });

  it('formats and visually clamps speaker share while describing its basis', () => {
    render(
      <SpeakerBars
        speakers={[
          { name: 'เอ', durationMs: 0, units: 10, turns: 1, share: 120.25, basis: 'spoken_units' }
        ]}
      />
    );
    expect(screen.getByText('120.3%')).toBeInTheDocument();
    expect(screen.getByText('คำนวณจากหน่วยคำพูดที่ระบบตรวจจับได้')).toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('.bar-track span')).toHaveStyle({ width: '100%' });
  });

  it.each([
    [null, 'ยังไม่ได้วิเคราะห์', 'วิเคราะห์'],
    ['pending', 'รอคิววิเคราะห์', 'รอคิว…'],
    ['running', 'กำลังวิเคราะห์…', 'กำลังวิเคราะห์…'],
    ['completed', 'วิเคราะห์แล้ว', 'วิเคราะห์ใหม่'],
    ['failed', 'วิเคราะห์ไม่สำเร็จ', 'ลองอีกครั้ง']
  ] as const)('maps %s status consistently', (status, statusText, buttonText) => {
    const meeting: Meeting = {
      id: 'm',
      workspaceId: 'w',
      title: 'ประชุม',
      source: 'source',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      createdAt: '',
      updatedAt: '',
      segments: [],
      speakerStats: [],
      analysis: status ? { ...analysis, status } : null
    };
    const { container } = render(
      <MeetingHeader meeting={meeting} analyzing={false} onAnalyze={vi.fn()} />
    );
    expect(container.querySelector('.analysis-status')).toHaveTextContent(statusText);
    expect(screen.getByRole('button', { name: buttonText })).toBeInTheDocument();
  });

  it('keeps analysis status visible to viewers without rendering its CTA', () => {
    const meeting: Meeting = {
      id: 'm',
      workspaceId: 'w',
      title: 'ประชุม',
      source: 'source',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      createdAt: '',
      updatedAt: '',
      segments: [],
      speakerStats: [],
      analysis
    };
    render(
      <MeetingHeader meeting={meeting} analyzing={false} onAnalyze={vi.fn()} canAnalyze={false} />
    );
    expect(screen.getByText('วิเคราะห์แล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'วิเคราะห์ใหม่' })).not.toBeInTheDocument();
  });
});
