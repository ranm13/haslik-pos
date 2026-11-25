/**
 * Inventory rules (pure, tested in Node).
 * Every decrease of an item's amount adds the same number to the shortages list (חוסרים):
 * to the item's open shortage line if there is one, otherwise as a new line (D29).
 */
import { invalid } from './errors';
import { cleanText } from './text';

export const MAX_AMOUNT = 100_000;

export function validateItemName(v: unknown): string {
  const n = cleanText(v, 80);
  if (!n) invalid('יש להזין שם פריט');
  return n;
}

/** Whole number 0…MAX_AMOUNT (inventory amount). */
export function validateAmount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (String(v ?? '').trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) {
    invalid('כמות חייבת להיות מספר שלם בין 0 ל-' + MAX_AMOUNT.toLocaleString('en-US'));
  }
  return n;
}

/** Shortage amount: whole number 1…MAX_AMOUNT, or null for "no amount". */
export function validateShortageQty(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_AMOUNT) invalid('כמות לקנייה חייבת להיות מספר שלם מ-1 ומעלה');
  return n;
}

/** How much a change from `before` to `after` adds to the shortages list (only decreases count). */
export function shortageDelta(before: number, after: number): number {
  return after < before ? before - after : 0;
}

/**
 * Ticking a shortage line "נקנה" restocks its inventory item (D30): open → bought adds the line's amount,
 * bought → open (a mistaken tick) takes it back. Lines without an item or an amount don't touch inventory.
 */
export function restockDelta(wasDone: boolean, nowDone: boolean, itemId: string, qty: number | null): number {
  if (!itemId || !qty || wasDone === nowDone) return 0;
  return nowDone ? qty : -qty;
}

/** New amount after a restock change; never below 0. */
export function applyRestock(amount: number, delta: number): number {
  return Math.max(0, amount + delta);
}

export type ShortagePlan =
  | { kind: 'none' }
  | { kind: 'create'; qty: number }
  | { kind: 'increase'; row: number; qty: number };

/** Where a decrease goes: the item's open shortage line counts up, otherwise a new line is created. */
export function planShortage(delta: number, open: { row: number; qty: number | null } | null): ShortagePlan {
  if (!(delta > 0)) return { kind: 'none' };
  if (open) return { kind: 'increase', row: open.row, qty: (open.qty || 0) + delta };
  return { kind: 'create', qty: delta };
}
