/**
 * Calendar logic in the script time zone (Asia/Jerusalem).
 * `Fmt` is injected: Utilities.formatDate in Apps Script, Intl in tests.
 * Patterns used: yyyy-MM, yyyy-MM-dd, MM, H, HH:mm, dd/MM, dd/MM/yyyy, dd/MM/yyyy HH:mm.
 */
export type Fmt = (d: Date, pattern: string) => string;

export const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const HOUR = 3600 * 1000;

export function monthKey(fmt: Fmt, d: Date): string {
  return fmt(d, 'yyyy-MM');
}

export function nextMonthKey(key: string): string {
  let [y, m] = key.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return y + '-' + String(m).padStart(2, '0');
}

export function periodTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return HEB_MONTHS[m - 1] + ' ' + y;
}

/**
 * Last calendar day of the month, in the script time zone.
 * Checks 12h ahead and 36h ahead (not exactly 24h) so DST changes can't skip or repeat a day.
 */
export function isLastDayOfMonth(fmt: Fmt, d: Date): boolean {
  const today = fmt(d, 'yyyy-MM-dd');
  // find "tomorrow" robustly: step forward until the date string changes
  let probe = new Date(d.getTime() + 12 * HOUR);
  if (fmt(probe, 'yyyy-MM-dd') === today) probe = new Date(d.getTime() + 24 * HOUR);
  if (fmt(probe, 'yyyy-MM-dd') === today) probe = new Date(d.getTime() + 36 * HOUR);
  return fmt(probe, 'MM') !== fmt(d, 'MM');
}

/** A sale at 01:30 belongs to the previous evening's shift. */
export function shiftDate(fmt: Fmt, d: Date, offsetHours: number): string {
  return fmt(new Date(d.getTime() - offsetHours * HOUR), 'yyyy-MM-dd');
}

/** Should the open period `periodKey` be closed at `now`? */
export function shouldClose(fmt: Fmt, periodKey: string, now: Date, closeHour: number): boolean {
  const thisKey = monthKey(fmt, now);
  if (periodKey < thisKey) return true; // missed a close (failed trigger) – close now
  return periodKey === thisKey && isLastDayOfMonth(fmt, now) && Number(fmt(now, 'H')) >= closeHour;
}

/** Key of the period that opens when `periodKey` closes at `now`. */
export function nextPeriodKeyOnClose(fmt: Fmt, periodKey: string, now: Date, closeHour: number): string {
  const thisKey = monthKey(fmt, now);
  let next = isLastDayOfMonth(fmt, now) && Number(fmt(now, 'H')) >= closeHour ? nextMonthKey(thisKey) : thisKey;
  if (next <= periodKey) next = nextMonthKey(periodKey);
  return next;
}

/** Minutes between two instants (b − a). */
export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}
