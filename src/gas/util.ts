import type { Fmt } from '../core/time';
import type { Sha256 } from '../core/auth';

export const tz = (): string => Session.getScriptTimeZone();

export const fmt: Fmt = (d, pattern) => Utilities.formatDate(d, tz(), pattern);

export const sha: Sha256 = text =>
  Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));

/** Uniform [0,1) from a fresh UUID (Math.random is fine in GAS too, but UUID is crypto-backed). */
export function rand(): number {
  const hex = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16) / 0x1000000000000;
}

export function randomToken(): string {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
}

export const heCompare = (a: string, b: string): number => a.localeCompare(b, 'he');

export function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

/** Sheets may turn '2026-10' into a Date; normalize back to a key. */
export function keyOf(v: unknown): string {
  if (v instanceof Date) return fmt(v, 'yyyy-MM');
  return String(v == null ? '' : v).replace(/^'/, '').trim();
}

export function dayOf(v: unknown): string {
  if (v instanceof Date) return fmt(v, 'yyyy-MM-dd');
  return String(v == null ? '' : v).replace(/^'/, '').trim();
}

export function isTrue(v: unknown): boolean {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

export function cache(): GoogleAppsScript.Cache.Cache {
  return CacheService.getScriptCache();
}
