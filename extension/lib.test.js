import { describe, expect, it } from 'vitest';
import { createQueueItem, normalizeServerUrl, retryDelayMs } from './lib.js';

describe('extension server URL validation', () => {
  it('normalizes HTTPS origins', () =>
    expect(normalizeServerUrl(' https://meet.example.com/ ')).toBe('https://meet.example.com'));
  it('rejects credentials, paths, and insecure remote origins', () => {
    expect(() => normalizeServerUrl('https://a:b@example.com')).toThrow();
    expect(() => normalizeServerUrl('https://example.com/api')).toThrow();
    expect(() => normalizeServerUrl('http://example.com')).toThrow();
  });
  it('allows localhost HTTP only in development', () => {
    expect(normalizeServerUrl('http://127.0.0.1:4317', false)).toBe('http://127.0.0.1:4317');
    expect(() => normalizeServerUrl('http://127.0.0.1:4317', true)).toThrow();
  });
});

describe('persistent retry queue helpers', () => {
  it('keeps idempotency keys stable and bounds backoff', () => {
    const item = createQueueItem({ title: 'x' }, '12345678-1234-1234-1234-123456789012');
    expect(item.idempotencyKey).toBe('12345678123412341234123456789012');
    expect(retryDelayMs(20)).toBe(15 * 60_000);
  });
});
