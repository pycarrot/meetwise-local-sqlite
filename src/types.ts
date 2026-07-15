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
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  model: string | null;
  analyzedAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  summary?: string[];
  decisions?: string[];
  actionItems?: { owner: string; task: string; due: string }[];
  topics?: Topic[];
};

export type Meeting = {
  id: string;
  workspaceId: string;
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

export type MeetingSummary = Pick<
  Meeting,
  'id' | 'workspaceId' | 'title' | 'source' | 'startedAt' | 'endedAt' | 'createdAt' | 'updatedAt'
> & {
  segmentCount: number;
  analysisStatus: Analysis['status'] | null;
};

export type Health = {
  ready: boolean;
  dependencies: {
    database: { ready: boolean };
    ollama: { connected: boolean; model: string; modelAvailable: boolean; error?: string };
  };
};

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type Workspace = { id: string; name: string; role: WorkspaceRole };
export type CurrentUser = { id: string; email: string; displayName: string; status: string };
export type Member = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  status: string;
  role: WorkspaceRole;
};
