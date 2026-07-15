import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashToken,
  signExtensionAccessToken,
  verifyExtensionAccessToken,
  verifyPassword
} from './crypto.js';

describe('authentication cryptography', () => {
  it('hashes passwords without retaining plaintext', async () => {
    const hash = await hashPassword('CorrectHorse7Battery');
    expect(hash).not.toContain('CorrectHorse7Battery');
    expect(await verifyPassword('CorrectHorse7Battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
  it('signs scoped, short-lived extension access tokens', async () => {
    const claims = {
      sub: crypto.randomUUID(),
      sid: crypto.randomUUID(),
      wid: crypto.randomUUID(),
      ver: 3
    };
    expect(await verifyExtensionAccessToken(await signExtensionAccessToken(claims))).toEqual(
      claims
    );
  });
  it('uses stable one-way token hashes', () => {
    expect(hashToken('a')).toBe(hashToken('a'));
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
