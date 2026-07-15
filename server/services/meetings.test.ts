import { describe, expect, it } from 'vitest';
import { hashIngestionPayload } from './meetings.js';

const payload = {
  title: 'Meeting',
  source: 'google-meet-caption' as const,
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: '2026-01-01T00:01:00Z',
  segments: [{ speaker: 'A', text: 'hello', startMs: 0, endMs: 100 }]
};

describe('ingestion idempotency', () => {
  it('is stable for an unchanged request and changes with content', () => {
    expect(hashIngestionPayload(payload)).toBe(hashIngestionPayload(structuredClone(payload)));
    expect(hashIngestionPayload({ ...payload, title: 'Different' })).not.toBe(
      hashIngestionPayload(payload)
    );
  });
});
