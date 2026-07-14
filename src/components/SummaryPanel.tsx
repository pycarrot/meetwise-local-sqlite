import type { Analysis } from '../types';

export function SummaryPanel({ analysis }: { analysis: Analysis | null }) {
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <h2 id="summary-title">สรุปการประชุม</h2>
      {analysis?.summary.length ? (
        <ul>
          {analysis.summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">เชื่อมต่อ Ollama แล้วกด “วิเคราะห์ใหม่” เพื่อสร้างสรุป</div>
      )}
    </section>
  );
}
