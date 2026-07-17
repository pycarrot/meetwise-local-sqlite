import { ChevronRight } from 'lucide-react';
import { colorForSpeaker } from '../lib/speakerColors';
import type { SpeakerStat, Topic } from '../types';

type TopicTableProps = {
  topics: Topic[];
  speakers: SpeakerStat[];
  selectedTopic: string;
  onSelect: (name: string) => void;
};

export function TopicTable({ topics, speakers, selectedTopic, onSelect }: TopicTableProps) {
  return (
    <section className="panel topics-panel" aria-labelledby="topics-title">
      <div className="panel-heading">
        <h2 id="topics-title">ใครพูดเรื่องอะไร</h2>
        <span>{topics.length} ประเด็น</span>
      </div>
      <div className="topic-table" role="list">
        {topics.map((topic, index) => {
          const expanded = selectedTopic === topic.name;
          const detailId = `topic-detail-${index}`;
          return (
            <div className="topic-item" key={topic.name}>
              <button
                className={`topic-row ${expanded ? 'selected' : ''}`}
                onClick={() => onSelect(expanded ? '' : topic.name)}
                type="button"
                aria-expanded={expanded}
                aria-controls={detailId}
              >
                <div className="topic-main">
                  <strong>{topic.name}</strong>
                  <span>{topic.summary}</span>
                </div>
                <div className="topic-speakers">
                  {topic.speakers.map((speaker) => (
                    <span key={speaker.name}>
                      <i style={{ background: colorForSpeaker(speaker.name, speakers) }} />
                      {speaker.name}
                    </span>
                  ))}
                </div>
                <ChevronRight className={expanded ? 'expanded' : ''} size={18} />
              </button>
              {expanded && (
                <div id={detailId} className="topic-detail">
                  <p>{topic.summary}</p>
                  {topic.speakers.map((speaker) => (
                    <div key={speaker.name}>
                      <strong>{speaker.name}</strong>
                      <span>{speaker.contribution}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!topics.length && <div className="empty-state compact">ยังไม่มีข้อมูลประเด็น</div>}
      </div>
    </section>
  );
}
