export type Segment = {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type SpeakerStat = {
  name: string;
  durationMs: number;
  units: number;
  turns: number;
  share: number;
  basis: 'duration' | 'spoken_units';
};

export type Topic = {
  name: string;
  summary: string;
  speakers: { name: string; contribution: string }[];
};

export type Analysis = {
  model: string;
  analyzedAt: string;
  summary: string[];
  decisions: string[];
  actionItems: { owner: string; task: string; due: string }[];
  topics: Topic[];
};

export type Meeting = {
  id: string;
  title: string;
  source: string;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  updatedAt: string;
  segments: Segment[];
  speakerStats: SpeakerStat[];
  analysis: Analysis | null;
};

export type MeetingSummary = Omit<Meeting, 'segments'> & { segmentCount: number };

export type Health = {
  ok: boolean;
  ollama: {
    connected: boolean;
    model: string;
    models: string[];
    modelAvailable: boolean;
    error?: string;
  };
};
