import type { SpeakerStat } from '../types';
import { speakerColors } from '../lib/speakerColors';

export function SpeakerBars({ speakers }: { speakers: SpeakerStat[] }) {
  return (
    <section className="panel speaker-panel" aria-labelledby="speaker-title">
      <h2 id="speaker-title">สัดส่วนการพูด</h2>
      <div className="speaker-bars">
        {speakers.map((speaker, index) => {
          const color = speakerColors[index % speakerColors.length];
          return (
            <div className="speaker-bar-row" key={speaker.name}>
              <span className="speaker-rail" style={{ background: color }} />
              <strong>{speaker.name}</strong>
              <div className="bar-track" aria-hidden="true">
                <span style={{ width: `${speaker.share}%`, background: color }} />
              </div>
              <span className="bar-value">{speaker.share}%</span>
            </div>
          );
        })}
      </div>
      <p className="panel-note">คำนวณจากระยะเวลาของช่วงคำบรรยายทั้งหมด</p>
    </section>
  );
}
