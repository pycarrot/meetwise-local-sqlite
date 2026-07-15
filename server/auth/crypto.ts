import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';

const jwtSecret = new TextEncoder().encode(config.tokenSigningSecret);

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function stableSecretHash(value: string): string {
  return createHmac('sha256', config.sessionSecret).update(value, 'utf8').digest('base64url');
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

type ExtensionClaims = { sub: string; sid: string; wid: string; ver: number };

export async function signExtensionAccessToken(claims: ExtensionClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid, wid: claims.wid, ver: claims.ver, kind: 'extension' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(config.publicBaseUrl)
    .setAudience('meetwise-extension')
    .setIssuedAt()
    .setExpirationTime(`${config.extensionAccessTtlMinutes}m`)
    .setJti(randomToken(16))
    .sign(jwtSecret);
}

export async function verifyExtensionAccessToken(token: string): Promise<ExtensionClaims> {
  const { payload } = await jwtVerify(token, jwtSecret, {
    issuer: config.publicBaseUrl,
    audience: 'meetwise-extension',
    algorithms: ['HS256']
  });
  if (
    payload.kind !== 'extension' ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.wid !== 'string' ||
    typeof payload.ver !== 'number'
  ) {
    throw new Error('Invalid token claims');
  }
  return { sub: payload.sub, sid: payload.sid, wid: payload.wid, ver: payload.ver };
}
