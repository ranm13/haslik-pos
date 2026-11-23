import type { ExpenseInput, ExpensesState } from '../shared/api';
import { toAgorot, toShekels } from '../shared/money';
import { AppError } from '../core/errors';
import { bookingWarning, expenseChangeError, expenseTotals, TYPE_LABEL, typeFromLabel, validateExpenseInput } from '../core/expenses';
import { asText, cleanText, fromText } from '../core/text';
import { alreadyDone, audit, markDone } from './audit';
import type { Ctx } from './auth';
import { requireOpenPeriod } from './periods';
import { addMissingHeaders, dataRows, findRow, sheet, withLock } from './sheets';
import { ACTIVE, E, EXPENSE_HEADERS, SHEETS, VOIDED } from './schema';
import { fmt, keyOf, tz } from './util';

/** Expenses sheet, with the `סוג` header added if this is the first write since the column was introduced. */
function expensesSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sh = sheet(SHEETS.EXPENSES);
  addMissingHeaders(sh, EXPENSE_HEADERS);
  return sh;
}

export function getExpensesState(): ExpensesState {
  const p = requireOpenPeriod();
  const items = dataRows(sheet(SHEETS.EXPENSES), EXPENSE_HEADERS.length)
    .filter(r => keyOf(r[E.PERIOD]) === p.key && r[E.STATUS] !== VOIDED)
    .map(r => {
      const d = r[E.DATE] instanceof Date ? r[E.DATE] as Date : null;
      return {
        id: fromText(r[E.ID]),
        date: d ? fmt(d, 'dd/MM') : String(r[E.DATE]),
        dateIso: d ? fmt(d, 'yyyy-MM-dd') : '',
        sortKey: d ? d.getTime() : 0,
        desc: fromText(r[E.DESC]),
        amountAgorot: toAgorot(r[E.AMOUNT] as number),
        type: typeFromLabel(r[E.TYPE]), // blank (rows before the column existed) = expense
      };
    })
    .sort((x, y) => y.sortKey - x.sortKey)
    .map(({ sortKey: _s, ...rest }) => rest);
  return { items, ...expenseTotals(items), periodTitle: p.title };
}

const tomorrowIso = () => fmt(new Date(Date.now() + 24 * 3600 * 1000), 'yyyy-MM-dd');

export function createExpense(ctx: Ctx, payload: ExpenseInput | undefined): ExpensesState {
  const v = validateExpenseInput(payload, tomorrowIso());
  if (!ctx.clientTxId) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  const date = Utilities.parseDate(v.date, tz(), 'yyyy-MM-dd');
  let warning = '';
  withLock(() => {
    const sh = expensesSheet();
    if (alreadyDone(ctx.clientTxId, sh)) return;
    const p = requireOpenPeriod();
    warning = bookingWarning(v.date, fmt(p.start, 'yyyy-MM-dd'), p.title);
    sh.appendRow([asText(ctx.clientTxId), new Date(), asText(p.key), date, asText(v.desc), toShekels(v.amountAgorot),
      asText(ctx.who), ACTIVE, '', '', TYPE_LABEL[v.type]]);
    markDone(ctx.clientTxId);
    audit('expense.create', ctx, ctx.clientTxId, v);
  });
  const state = getExpensesState();
  state.warning = warning;
  return state;
}

/** Edits date / description / amount / type of an active row in the open month. The booking month never changes. */
export function updateExpense(ctx: Ctx, payload: (ExpenseInput & { expenseId: string }) | undefined): ExpensesState {
  const id = cleanText(payload?.expenseId, 80);
  if (!id) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  const v = validateExpenseInput(payload, tomorrowIso());
  const date = Utilities.parseDate(v.date, tz(), 'yyyy-MM-dd');
  let warning = '';
  withLock(() => {
    const sh = expensesSheet();
    const row = findRow(sh, id);
    if (!row) throw new AppError('NOT_FOUND', 'ההוצאה לא נמצאה');
    const r = sh.getRange(row, 1, 1, EXPENSE_HEADERS.length).getValues()[0];
    const p = requireOpenPeriod();
    const err = expenseChangeError(r[E.STATUS] === VOIDED, keyOf(r[E.PERIOD]), p.key);
    if (err) throw new AppError('VALIDATION', err);
    warning = bookingWarning(v.date, fmt(p.start, 'yyyy-MM-dd'), p.title);
    const before = {
      date: r[E.DATE] instanceof Date ? fmt(r[E.DATE] as Date, 'yyyy-MM-dd') : String(r[E.DATE]),
      desc: fromText(r[E.DESC]), amountAgorot: toAgorot(r[E.AMOUNT] as number), type: typeFromLabel(r[E.TYPE]),
    };
    sh.getRange(row, E.DATE + 1, 1, 3).setValues([[date, asText(v.desc), toShekels(v.amountAgorot)]]);
    sh.getRange(row, E.TYPE + 1).setValue(TYPE_LABEL[v.type]);
    audit('expense.update', ctx, ctx.clientTxId, { expenseId: id, before, after: v });
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
