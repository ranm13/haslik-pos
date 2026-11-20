import type { Role, SaleInput } from '../shared/api';
import type { Agorot } from '../shared/money';
import { invalid } from './errors';
import { cleanText } from './text';

export const MAX_QTY = 20;
export const BAR_UNDO_MINUTES = 30;

export interface ValidSale {
  memberId?: string;
  guest?: { first: string; last: string };
  cardType: string;
  qty: number;
  note: string;
}

export function validateSaleInput(p: SaleInput | undefined): ValidSale {
  if (!p) invalid('בקשה לא תקינה');
  const input = p as SaleInput;
  const qty = Number(input.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) invalid('כמות לא תקינה');
  const cardType = cleanText(input.cardType, 40);
  if (!cardType) invalid('יש לבחור סוג כרטיסייה');
  const note = cleanText(input.note, 200);
  if (input.memberId) {
    return { memberId: cleanText(input.memberId, 80), cardType, qty, note };
  }
  const first = cleanText(input.guest?.first, 60);
  const last = cleanText(input.guest?.last, 60);
  if (!first && !last) invalid('יש להזין שם');
  return { guest: { first, last }, cardType, qty, note };
}

export function saleTotal(unitPrice: Agorot, qty: number): Agorot {
  return unitPrice * qty;
}

export interface VoidCheck {
  role: Role;
  status: 'active' | 'voided';
  salePeriodKey: string;
  openPeriodKey: string;
  ageMinutes: number;
}

/** 'noop' = already voided. Throws with a Hebrew message when not allowed. */
export function checkVoid(c: VoidCheck): 'ok' | 'noop' {
  if (c.status === 'voided') return 'noop';
  if (c.salePeriodKey !== c.openPeriodKey) invalid('החודש של הרישום כבר נסגר – לא ניתן לבטל');
  if (c.role !== 'admin' && c.ageMinutes > BAR_UNDO_MINUTES) {
    invalid('אפשר לבטל רק ' + BAR_UNDO_MINUTES + ' דקות אחרי הרישום. פנה למנהל');
  }
  return 'ok';
}

export function canUndo(role: Role, voided: boolean, ageMinutes: number): boolean {
  return !voided && (role === 'admin' || ageMinutes <= BAR_UNDO_MINUTES);
}

export function guestKey(last: string, first: string): string {
  return 'guest|' + last + '|' + first;
}

export function memberKey(last: string, first: string): string {
  return last + '|' + first;
}
