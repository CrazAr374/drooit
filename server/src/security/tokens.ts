import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { SESSION_CODE_DIGITS } from '@shared/constants.js';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** 256 bits of entropy, URL-safe. Used for peer and invite secrets. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 128-bit opaque session identifier (hex keeps URLs and logs unambiguous). */
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

/** Cryptographically secure numeric pairing code, zero-padded to 6 digits. */
export function generatePairingCode(): string {
  return randomInt(0, 10 ** SESSION_CODE_DIGITS)
    .toString()
    .padStart(SESSION_CODE_DIGITS, '0');
}

export function isPairingCode(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^\\d{${SESSION_CODE_DIGITS}}$`).test(value);
}

export function isTokenShape(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 128 && BASE64URL.test(value);
}

/** Constant-time comparison that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
