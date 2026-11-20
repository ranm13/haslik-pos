import type { ExpenseInput, ExpensesState } from '../shared/api';
import { toAgorot, toShekels } from '../shared/money';
import { AppError } from '../core/errors';
import { bookingWarning, expenseTotals, validateExpenseInput } from '../core/expenses';
import { asText, cleanText, fromText } from '../core/text';
import { alreadyDone, audit, markDone } from './audit';
import type { Ctx } from './auth';
import { requireOpenPeriod } from './periods';
import { dataRows, findRow, sheet, withLock } from './sheets';
import { ACTIVE, E, EXPENSE_HEADERS, SHEETS, VOIDED } from './schema';
import { fmt, keyOf, tz } from './util';

export function getExpensesState(): ExpensesState {
  const p = requireOpenPeriod();
  const items = dataRows(sheet(SHEETS.EXPENSES), EXPENSE_HEADERS.length)
    .filter(r => keyOf(r[E.PERIOD]) === p.key && r[E.STATUS] !== VOIDED)
    .map(r => ({
      id: fromText(r[E.ID]),
      date: r[E.DATE] instanceof Date ? fmt(r[E.DATE] as Date, 'dd/MM') : String(r[E.DATE]),
      sortKey: r[E.DATE] instanceof Date ? (r[E.DATE] as Date).getTime() : 0,
      desc: fromText(r[E.DESC]),
      amountAgorot: toAgorot(r[E.AMOUNT] as number),
      type: 'EXPENSE' as const, // credits come in stage 3
    }))
    .sort((x, y) => y.sortKey - x.sortKey)
    .map(({ sortKey: _s, ...rest }) => rest);
  return { items, ...expenseTotals(items), periodTitle: p.title };
}

export function createExpense(ctx: Ctx, payload: ExpenseInput | undefined): ExpensesState {
  const tomorrow = fmt(new Date(Date.now() + 24 * 3600 * 1000), 'yyyy-MM-dd');
  const v = validateExpenseInput(payload, tomorrow);
  if (!ctx.clientTxId) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  const date = Utilities.parseDate(v.date, tz(), 'yyyy-MM-dd');
  let warning = '';
  withLock(() => {
    const sh = sheet(SHEETS.EXPENSES);
    if (alreadyDone(ctx.clientTxId, sh)) return;
    const p = requireOpenPeriod();
    warning = bookingWarning(v.date, fmt(p.start, 'yyyy-MM-dd'), p.title);
    sh.appendRow([asText(ctx.clientTxId), new Date(), asText(p.key), date, asText(v.desc), toShekels(v.amountAgorot),
      asText(ctx.who), ACTIVE, '', '']);
    markDone(ctx.clientTxId);
    audit('expense.create', ctx, ctx.clientTxId, v);
  });
  const state = getExpensesState();
  state.warning = warning;
  return state;
}

export function voidExpense(ctx: Ctx, expenseId: string): ExpensesState {
  const id = cleanText(expenseId, 80);
  withLock(() => {
    const sh = sheet(SHEETS.EXPENSES);
    const row = findRow(sh, id);
    if (!row) throw new AppError('NOT_FOUND', 'ההוצאה לא נמצאה');
    const r = sh.getRange(row, 1, 1, EXPENSE_HEADERS.length).getValues()[0];
    if (r[E.STATUS] === VOIDED) return;
    if (keyOf(r[E.PERIOD]) !== requireOpenPeriod().key) throw new AppError('VALIDATION', 'החודש כבר נסגר – לא ניתן לבטל');
    sh.getRange(row, E.STATUS + 1, 1, 3).setValues([[VOIDED, new Date(), asText(ctx.who)]]);
    audit('expense.void', ctx, ctx.clientTxId, { expenseId: id });
  });
  return getExpensesState();
}
