import { createHash, createHmac, randomBytes } from 'crypto';

/** Generates a cryptographically random, URL-safe lab credential. */
export function generateLabKey(): string {
  return randomBytes(32).toString('base64url');
}

/** Hashes a lab credential with a server-side secret (HMAC-SHA256). */
export function hashLabKey(key: string, secret: string): string {
  return createHmac('sha256', secret).update(key).digest('hex');
}

/** Hashes an arbitrary value (e.g. IP address) with a server-side secret. */
export function hashWithSecret(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Deterministic, non-secret content hash used for body correlation in logs. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
