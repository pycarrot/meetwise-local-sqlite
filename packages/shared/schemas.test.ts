import { describe, expect, it } from 'vitest';
import { meetingIngestionSchema, passwordSchema, registerSchema } from './schemas.js';

describe('shared validation', () => {
  it('requires strong passwords', () => {
    expect(passwordSchema.safeParse('weak-password').success).toBe(false);
    expect(passwordSchema.safeParse('CorrectHorse7Battery').success).toBe(true);
  });
  it('validates and normalizes self-registration', () => {
    expect(
      registerSchema.parse({
        displayName: ' New User ',
        email: 'NEW@EXAMPLE.COM',
        password: 'CorrectHorse7Battery',
        workspaceName: ' Internal Team '
      })
    ).toEqual({
      displayName: 'New User',
      email: 'new@example.com',
      password: 'CorrectHorse7Battery',
      workspaceName: 'Internal Team'
    });
    expect(
      registerSchema.safeParse({
        displayName: 'N',
        email: 'invalid',
        password: 'weak',
        workspaceName: 'I'
      }).success
    ).toBe(false);
  });
  it('bounds ingestion and transcript timestamps', () => {
    const base = {
      title: 'Standup',
      source: 'google-meet-caption',
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T00:01:00Z',
      segments: [{ speaker: 'A', text: 'Hello', startMs: 20, endMs: 10 }]
    };
    expect(meetingIngestionSchema.safeParse(base).success).toBe(false);
    expect(
      meetingIngestionSchema.safeParse({ ...base, segments: [{ ...base.segments[0], endMs: 30 }] })
        .success
    ).toBe(true);
  });
});
