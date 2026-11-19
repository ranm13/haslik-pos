import { createHash } from 'node:crypto';
import type { Fmt } from '../src/core/time';
import type { Sha256 } from '../src/core/auth';

const TZ = 'Asia/Jerusalem';

/** Test implementation of Utilities.formatDate for the patterns the code uses. */
export const fmt: Fmt = (d, pattern) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map(p => [p.type, p.value]),
  ) as Record<string, string>;
  return pattern
    .replace('yyyy', parts.year)
    .replace('MM', parts.month)
    .replace('dd', parts.day)
    .replace('HH', parts.hour)
    .replace(/\bH\b/, String(Number(parts.hour)))
    .replace('mm', parts.minute)
    .replace('ss', parts.second);
};

/** Builds an instant from a wall-clock time in Asia/Jerusalem, e.g. il('2026-03-27 01:30'). */
export function il(wall: string): Date {
  const [date, time = '00:00'] = wall.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const want = `${date} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  for (const off of [2, 3]) {
    const t = new Date(Date.UTC(y, mo - 1, d, h - off, mi));
    if (fmt(t, 'yyyy-MM-dd HH:mm') === want) return t;
  }
  throw new Error('invalid wall time ' + wall);
}

export const sha: Sha256 = text => createHash('sha256').update(text, 'utf8').digest('base64');

export const he = (a: string, b: string) => a.localeCompare(b, 'he');
