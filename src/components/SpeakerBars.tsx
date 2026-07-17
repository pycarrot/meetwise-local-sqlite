import type { SpeakerStat } from '../types';
import { speakerColors } from '../lib/speakerColors';

export function SpeakerBars({ speakers }: { speakers: SpeakerStat[] }) {
  return (
    <section className="panel speaker-panel" aria-labelledby="speaker-title">
      <h2 id="speaker-title">สัดส่วนการพูด</h2>
      <div className="speaker-bars">
        {speakers.map((speaker, index) => {
          const color = speakerColors[index % speakerColors.length];
          const share = Number.isFinite(speaker.share) ? speaker.share : 0;
          const formattedShare = Number(share.toFixed(1));
          return (
            <div className="speaker-bar-row" key={speaker.name}>
              <span className="speaker-rail" style={{ background: color }} />
              <strong>{speaker.name}</strong>
              <div className="bar-track" aria-hidden="true">
                <span
                  style={{ width: `${Math.min(100, Math.max(0, share))}%`, background: color }}
                />
              </div>
              <span className="bar-value">{formattedShare}%</span>
            </div>
          );
        })}
      </div>
      <p className="panel-note">
        {speakers.some((speaker) => speaker.basis === 'duration') &&
        speakers.some((speaker) => speaker.basis === 'spoken_units')
          ? 'สัดส่วนคำนวณตาม basis ที่ระบุในข้อมูลของผู้พูดแต่ละคน'
          : speakers[0]?.basis === 'spoken_units'
            ? 'คำนวณจากหน่วยคำพูดที่ระบบตรวจจับได้'
            : 'คำนวณจากระยะเวลาของช่วงคำบรรยายทั้งหมด'}
      </p>
    </section>
  );
}
