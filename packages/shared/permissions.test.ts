import { describe, expect, it } from 'vitest';
import { roleCan } from './permissions.js';

describe('workspace permission policy', () => {
  it('keeps viewers read-only', () => {
    expect(roleCan('viewer', 'meetings:read')).toBe(true);
    expect(roleCan('viewer', 'meetings:create')).toBe(false);
    expect(roleCan('viewer', 'meetings:analyze')).toBe(false);
  });
  it('reserves workspace management for owners', () => {
    expect(roleCan('owner', 'workspace:manage')).toBe(true);
    expect(roleCan('admin', 'workspace:manage')).toBe(false);
  });
});
