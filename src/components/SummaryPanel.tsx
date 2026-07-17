import { useState } from 'react';
import type { Analysis } from '../types';

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function SummaryPanel({ analysis, source }: { analysis: Analysis | null; source?: string }) {
  const [copyStatus, setCopyStatus] = useState('');
  const copy = async (text: string) => {
    try {
      await copyText(text);
      setCopyStatus('คัดลอกแล้ว');
    } catch {
      setCopyStatus('คัดลอกไม่สำเร็จ');
    }
  };
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <h2 id="summary-title">สรุปการประชุม</h2>
      {analysis?.summary?.length ? (
        <button type="button" onClick={() => void copy(analysis.summary!.join('\n'))}>
          คัดลอกสรุป
        </button>
      ) : null}
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
      {analysis?.decisions?.length ? (
        <div className="analysis-section">
          <h3>มติ/การตัดสินใจ</h3>
          <ul>
            {analysis.decisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis?.actionItems?.length ? (
        <div className="analysis-section">
          <h3>งานที่ต้องทำ</h3>
          <ul>
            {analysis.actionItems.map((item, index) => (
              <li key={`${item.task}-${index}`}>
                <strong>{item.task}</strong>
                {(item.owner || item.due) && (
                  <small>
                    {[item.owner && `ผู้รับผิดชอบ: ${item.owner}`, item.due && `กำหนด: ${item.due}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(analysis?.decisions?.length || analysis?.actionItems?.length) && (
        <button
          type="button"
          onClick={() =>
            void copy(
              [
                ...(analysis?.decisions ?? []).map((item) => `มติ: ${item}`),
                ...(analysis?.actionItems ?? []).map(
                  (item) =>
                    `งาน: ${item.task}${item.owner ? ` · ${item.owner}` : ''}${item.due ? ` · ${item.due}` : ''}`
                )
              ].join('\n')
            )
          }
        >
          คัดลอกมติและงานที่ต้องทำ
        </button>
      )}
      {(analysis?.model || analysis?.analyzedAt || source) && (
        <dl className="analysis-metadata">
          {analysis?.model && (
            <>
              <dt>โมเดล</dt>
              <dd>{analysis.model}</dd>
            </>
          )}
          {analysis?.analyzedAt && (
            <>
              <dt>วิเคราะห์เมื่อ</dt>
              <dd>{new Date(analysis.analyzedAt).toLocaleString('th-TH')}</dd>
            </>
          )}
          {source && (
            <>
              <dt>แหล่งข้อมูล</dt>
              <dd>{source}</dd>
            </>
          )}
        </dl>
      )}
      {copyStatus && <div role="status">{copyStatus}</div>}
    </section>
  );
}
