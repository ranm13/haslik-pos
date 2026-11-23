import type { ExpenseInput, ExpenseType } from '../shared/api';
import { isAgorot, type Agorot } from '../shared/money';
import { invalid } from './errors';
import { cleanText } from './text';

export const MAX_EXPENSE_AGOROT = 100_000_000; // ₪1,000,000 (exclusive)

export const TYPE_LABEL: Record<ExpenseType, string> = { EXPENSE: 'הוצאה', CREDIT: 'זיכוי' };

export function typeFromLabel(label: unknown): ExpenseType {
  return String(label || '').replace(/^'/, '').trim() === TYPE_LABEL.CREDIT ? 'CREDIT' : 'EXPENSE';
}

export interface ValidExpense { date: string; desc: string; amountAgorot: Agorot; type: ExpenseType }

/**
 * @param todayIso today's date in the script time zone (yyyy-MM-dd)
 * @param tomorrowIso tomorrow's date — a date up to one day ahead is allowed (legacy rule)
 */
export function validateExpenseInput(p: ExpenseInput | undefined, tomorrowIso: string): ValidExpense {
  if (!p) invalid('בקשה לא תקינה');
  const input = p as ExpenseInput;
  const desc = cleanText(input.desc, 200);
  if (!desc) invalid('יש להזין פירוט');
  const a = input.amountAgorot;
  if (!isAgorot(a) || a <= 0 || a >= MAX_EXPENSE_AGOROT) invalid('סכום לא תקין');
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) invalid('תאריך לא תקין');
  if (date > tomorrowIso) invalid('תאריך עתידי');
  const type: ExpenseType = input.type === 'CREDIT' ? 'CREDIT' : 'EXPENSE';
  return { date, desc, amountAgorot: a, type };
}

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Legacy rule: an expense dated before the open period is booked to the open period, with a warning. */
export function bookingWarning(dateIso: string, periodStartIso: string, periodTitle: string): string {
  return dateIso < periodStartIso
    ? 'התאריך שייך לחודש שכבר נסגר – ההוצאה נרשמה בחודש הנוכחי (' + periodTitle + ')'
    : '';
}

/** An expense can be edited only while it is active and belongs to the open month. '' = allowed. */
export function expenseChangeError(voided: boolean, rowPeriodKey: string, openPeriodKey: string): string {
  if (voided) return 'השורה בוטלה – אי אפשר לערוך אותה';
  if (rowPeriodKey !== openPeriodKey) return 'החודש של השורה כבר נסגר – אי אפשר לערוך';
  return '';
}

export interface ExpenseTotals { expensesAgorot: Agorot; creditsAgorot: Agorot; netAgorot: Agorot }

export function expenseTotals(items: readonly { amountAgorot: Agorot; type: ExpenseType }[]): ExpenseTotals {
  let e = 0, c = 0;
  for (const it of items) {
    if (it.type === 'CREDIT') c += it.amountAgorot; else e += it.amountAgorot;
  }
  return { expensesAgorot: e, creditsAgorot: c, netAgorot: e - c };
}
