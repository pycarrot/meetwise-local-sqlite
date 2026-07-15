import type { Analysis } from '../types';

export function SummaryPanel({ analysis }: { analysis: Analysis | null }) {
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <h2 id="summary-title">สรุปการประชุม</h2>
      {analysis?.summary?.length ? (
        <ul>
          {analysis.summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          {analysis?.status === 'failed'
            ? analysis.failureReason || 'วิเคราะห์ไม่สำเร็จ'
            : analysis?.status === 'pending' || analysis?.status === 'running'
              ? 'กำลังประมวลผลบน server…'
              : 'กด “วิเคราะห์ใหม่” เพื่อสร้างสรุป'}
        </div>
      )}
    </section>
  );
}
