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
        {topics.map((topic) => (
          <button
            className={`topic-row ${selectedTopic === topic.name ? 'selected' : ''}`}
            key={topic.name}
            onClick={() => onSelect(topic.name)}
            type="button"
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
            <ChevronRight size={18} />
          </button>
        ))}
        {!topics.length && <div className="empty-state compact">ยังไม่มีข้อมูลประเด็น</div>}
      </div>
    </section>
  );
}
