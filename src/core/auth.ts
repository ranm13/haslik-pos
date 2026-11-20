import type { Role } from '../shared/api';
import { invalid } from './errors';

/** SHA-256 → base64, injected (Utilities.computeDigest in GAS, node:crypto in tests). */
export type Sha256 = (text: string) => string;

export const MAX_PIN_FAILS = 10;
export const LOCK_MINUTES = 10;

export function validatePinFormat(pin: string, label: string): string {
  const p = String(pin || '').trim();
  if (!/^\d{4,10}$/.test(p)) invalid(label + ' חייב להיות 4–10 ספרות');
  return p;
}

export function hashSecret(sha: Sha256, salt: string, secret: string): string {
  return sha(salt + ':' + secret);
}

/** Length-independent comparison so timing doesn't leak how many characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export interface PinHashes { salt: string; bar: string; admin: string }

/** Returns the role for a PIN, or null. Admin PIN wins if both are (mis)configured the same. */
export function roleForPin(sha: Sha256, hashes: PinHashes, pin: string): Role | null {
  if (!pin) return null;
  const h = hashSecret(sha, hashes.salt, String(pin).trim());
  if (safeEqual(h, hashes.admin)) return 'admin';
  if (safeEqual(h, hashes.bar)) return 'bar';
  return null;
}

export function isLocked(fails: number): boolean {
  return fails >= MAX_PIN_FAILS;
}

export function validatePinPair(barPin: string, adminPin: string): void {
  if (barPin === adminPin) invalid('קוד הבר וקוד המנהל חייבים להיות שונים');
}
