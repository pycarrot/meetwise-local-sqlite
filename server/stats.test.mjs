import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpeakerStats, normalizeMeeting } from './stats.mjs';

test('computeSpeakerStats ranks speakers using duration when available', () => {
  const stats = computeSpeakerStats([
    { speaker: 'เมย์', text: 'สวัสดีค่ะ', startMs: 0, endMs: 6000 },
    { speaker: 'นนท์', text: 'ครับ', startMs: 6000, endMs: 8000 }
  ]);
  assert.equal(stats[0].name, 'เมย์');
  assert.equal(stats[0].share, 75);
  assert.equal(stats[0].basis, 'duration');
});

test('normalizeMeeting removes empty segments and computes stats', () => {
  const meeting = normalizeMeeting({
    title: ' Test ',
    segments: [{ speaker: 'A', text: ' hello ', startMs: 0, endMs: 1000 }, { text: ' ' }]
  });
  assert.equal(meeting.title, 'Test');
  assert.equal(meeting.segments.length, 1);
  assert.equal(meeting.speakerStats.length, 1);
});
