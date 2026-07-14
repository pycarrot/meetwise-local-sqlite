import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { formatTime } from '../lib/format';
import type { Segment, SpeakerStat } from '../types';
import { colorForSpeaker } from '../lib/speakerColors';

export function Transcript({
  segments,
  speakers
}: {
  segments: Segment[];
  speakers: SpeakerStat[];
}) {
  const [speaker, setSpeaker] = useState('ทั้งหมด');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('th'));
  const filtered = useMemo(
    () =>
      segments.filter((segment) => {
        const speakerMatches = speaker === 'ทั้งหมด' || segment.speaker === speaker;
        const queryMatches =
          !deferredQuery || segment.text.toLocaleLowerCase('th').includes(deferredQuery);
        return speakerMatches && queryMatches;
      }),
    [deferredQuery, segments, speaker]
  );

  return (
    <section className="panel transcript-panel" aria-labelledby="transcript-title">
      <div className="transcript-toolbar">
        <h2 id="transcript-title">บทสนทนา</h2>
        <div className="speaker-filters" aria-label="กรองตามผู้พูด">
          {['ทั้งหมด', ...speakers.map((item) => item.name)].map((name) => (
            <button
              className={speaker === name ? 'active' : ''}
              key={name}
              onClick={() => setSpeaker(name)}
              type="button"
            >
              {name !== 'ทั้งหมด' && <i style={{ background: colorForSpeaker(name, speakers) }} />}
              {name}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <span className="sr-only">ค้นหาในบทสนทนา</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาในบทสนทนา"
          />
        </label>
      </div>
      <div className="transcript-list">
        {filtered.map((segment) => {
          const color = colorForSpeaker(segment.speaker, speakers);
          return (
            <article className="transcript-row" key={segment.id}>
              <time>{formatTime(segment.startMs)}</time>
              <span className="timeline-dot" style={{ background: color }} />
              <strong style={{ color }}>{segment.speaker}</strong>
              <p>{segment.text}</p>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="empty-state compact">ไม่พบบทสนทนาที่ตรงกับตัวกรอง</div>
        )}
      </div>
    </section>
  );
}
