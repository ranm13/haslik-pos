import type { CardType, Role, SaleInput, ShiftState } from '../shared/api';
import { toAgorot, toShekels } from '../shared/money';
import { AppError } from '../core/errors';
import { canUndo, checkVoid, saleTotal, validateSaleInput } from '../core/sales';
import { asText, cleanText, fromText } from '../core/text';
import { minutesBetween, shiftDate } from '../core/time';
import { alreadyDone, audit, markDone } from './audit';
import type { Ctx } from './auth';
import { SHIFT_OFFSET_HOURS } from './config';
import { resolveSaleMember } from './members';
import { requireOpenPeriod } from './periods';
import { dataRows, findRow, sheet, tailRows, withLock } from './sheets';
import { ACTIVE, S, SALES_HEADERS, SHEETS, VOIDED } from './schema';
import { dayOf, fmt, isTrue, keyOf, toDate } from './util';

export function getCardTypes(includeInactive: boolean): (CardType & { active: boolean })[] {
  return dataRows(sheet(SHEETS.TYPES), 3)
    .map(r => ({ name: cleanText(r[0], 40), priceAgorot: toAgorot(r[1] as number), active: isTrue(r[2]) }))
    .filter(t => t.name && t.priceAgorot > 0 && (includeInactive || t.active));
}

export function getShiftState(role: Role): ShiftState {
  const today = shiftDate(fmt, new Date(), SHIFT_OFFSET_HOURS);
  const out: ShiftState = { date: today, cards: 0, amountAgorot: 0, recent: [] };
  const now = new Date();
  const rows = tailRows(sheet(SHEETS.SALES), 400, SALES_HEADERS.length);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i].values;
    if (dayOf(r[S.SHIFT]) !== today) continue;
    const voided = r[S.STATUS] === VOIDED;
    const total = toAgorot(r[S.TOTAL] as number);
    if (!voided) { out.cards += Number(r[S.QTY]); out.amountAgorot += total; }
    if (out.recent.length < 40) {
      const ts = toDate(r[S.TS]);
      out.recent.push({
        id: fromText(r[S.ID]),
        time: fmt(ts, 'HH:mm'),
        name: (fromText(r[S.FIRST]) + ' ' + fromText(r[S.LAST])).trim(),
        cardType: fromText(r[S.TYPE]),
        qty: Number(r[S.QTY]),
        totalAgorot: total,
        note: fromText(r[S.NOTE]),
        inList: r[S.INLIST] === 'כן',
        voided,
        canUndo: canUndo(role, voided, minutesBetween(ts, now)),
      });
    }
  }
  return out;
}

export function createSale(ctx: Ctx, payload: SaleInput | undefined): ShiftState {
  const v = validateSaleInput(payload);
  if (!ctx.clientTxId) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  const type = getCardTypes(false).find(t => t.name === v.cardType);
  if (!type) throw new AppError('VALIDATION', 'סוג הכרטיסייה לא קיים או לא פעיל');
  const m = resolveSaleMember(v);

  withLock(() => {
    const sh = sheet(SHEETS.SALES);
    if (alreadyDone(ctx.clientTxId, sh)) return; // double tap / retry – don't record twice
    const p = requireOpenPeriod();
    const now = new Date();
    const total = saleTotal(type.priceAgorot, v.qty);
    sh.appendRow([
      asText(ctx.clientTxId), now, asText(p.key), asText(shiftDate(fmt, now, SHIFT_OFFSET_HOURS)),
      asText(m.last), asText(m.first), asText(m.key), m.inList ? 'כן' : 'לא',
      asText(type.name), v.qty, toShekels(type.priceAgorot), toShekels(total),
      v.note ? asText(v.note) : '', asText(ctx.who), ACTIVE, '', '',
    ]);
    markDone(ctx.clientTxId);
    audit('sale.create', ctx, ctx.clientTxId, { key: m.key, type: type.name, qty: v.qty, totalAgorot: total });
  });
  return getShiftState(ctx.role);
}

export function voidSale(ctx: Ctx, saleId: string): ShiftState {
  const id = cleanText(saleId, 80);
  withLock(() => {
    const sh = sheet(SHEETS.SALES);
    const row = findRow(sh, id);
    if (!row) throw new AppError('NOT_FOUND', 'הרישום לא נמצא');
    const r = sh.getRange(row, 1, 1, SALES_HEADERS.length).getValues()[0];
    const result = checkVoid({
      role: ctx.role,
      status: r[S.STATUS] === VOIDED ? 'voided' : 'active',
      salePeriodKey: keyOf(r[S.PERIOD]),
      openPeriodKey: requireOpenPeriod().key,
      ageMinutes: minutesBetween(toDate(r[S.TS]), new Date()),
    });
    if (result === 'noop') return;
    sh.getRange(row, S.STATUS + 1, 1, 3).setValues([[VOIDED, new Date(), asText(ctx.who)]]);
    audit('sale.void', ctx, ctx.clientTxId, { saleId: id });
  });
  return getShiftState(ctx.role);
}
