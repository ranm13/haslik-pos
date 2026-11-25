import type { Todo } from '../shared/api';
import { AppError } from '../core/errors';
import { planShortage, validateShortageQty } from '../core/inventory';
import { asText, cleanText, fromText } from '../core/text';
import { alreadyDone, audit, markDone } from './audit';
import type { Ctx } from './auth';
import { addMissingHeaders, dataRows, findRow, sheetOrCreate, withLock } from './sheets';
import { SHEETS, T, TODO_DELETED, TODO_DONE, TODO_HEADERS, TODO_OPEN } from './schema';
import { fmt, toDate } from './util';

let todoMemo: GoogleAppsScript.Spreadsheet.Sheet | null = null;
let headersChecked = false;
function todoSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  if (!todoMemo) todoMemo = sheetOrCreate(SHEETS.TODO, TODO_HEADERS, [], { 4: 'dd/MM/yyyy HH:mm', 6: 'dd/MM/yyyy HH:mm' });
  return todoMemo;
}
/** For writes: adds the `כמות` / `מזהה פריט` headers once if the sheet predates them (D29). */
function todoSheetForWrite(): GoogleAppsScript.Spreadsheet.Sheet {
  const sh = todoSheet();
  if (!headersChecked) { addMissingHeaders(sh, TODO_HEADERS); headersChecked = true; }
  return sh;
}

const qtyOf = (v: unknown): number | null => {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) || n <= 0 ? null : n;
};

export function getTodos(): Todo[] {
  const rows = dataRows(todoSheet(), TODO_HEADERS.length).filter(r => r[T.STATUS] !== TODO_DELETED && fromText(r[T.ID]));
  const all = rows.map(r => {
    const created = toDate(r[T.CREATED]);
    const updated = r[T.UPDATED] instanceof Date ? r[T.UPDATED] as Date : created;
    return {
      id: fromText(r[T.ID]), text: fromText(r[T.TEXT]), done: r[T.STATUS] === TODO_DONE, date: fmt(created, 'dd/MM'),
      qty: qtyOf(r[T.QTY]), itemId: fromText(r[T.ITEM_ID]), c: created.getTime(), u: updated.getTime(),
    };
  });
  const open = all.filter(x => !x.done).sort((a, b) => b.c - a.c);            // newest first
  const done = all.filter(x => x.done).sort((a, b) => b.u - a.u).slice(0, 25); // last 25 bought
  return open.concat(done).map(({ c: _c, u: _u, ...t }) => t);
}

export function createTodo(ctx: Ctx, text: string, qtyIn?: number | null): Todo[] {
  const t = cleanText(text, 120);
  if (!t) throw new AppError('VALIDATION', 'יש להזין פריט');
  const qty = validateShortageQty(qtyIn);
  if (!ctx.clientTxId) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  withLock(() => {
    const sh = todoSheetForWrite();
    if (alreadyDone(ctx.clientTxId, sh)) return;
    const now = new Date();
    sh.appendRow([asText(ctx.clientTxId), asText(t), TODO_OPEN, now, asText(ctx.who), now, asText(ctx.who), qty ?? '', '']);
    markDone(ctx.clientTxId);
    audit('todo.create', ctx, ctx.clientTxId, { text: t, qty });
  });
  return getTodos();
}

export function updateTodo(ctx: Ctx, p: { todoId: string; text?: string; done?: boolean; qty?: number | null } | undefined): Todo[] {
  if (!p) throw new AppError('VALIDATION', 'בקשה לא תקינה');
  const qtyGiven = Object.prototype.hasOwnProperty.call(p, 'qty');
  const qty = qtyGiven ? validateShortageQty(p.qty) : null;
  withLock(() => {
    const sh = todoSheetForWrite();
    const row = findRow(sh, cleanText(p.todoId, 80));
    if (!row) throw new AppError('NOT_FOUND', 'הפריט לא נמצא');
    if (sh.getRange(row, T.STATUS + 1).getValue() === TODO_DELETED) throw new AppError('CONFLICT', 'מישהו אחר כבר מחק את הפריט');
    if (p.text !== undefined && p.text !== null) {
      const text = cleanText(p.text, 120);
      if (!text) throw new AppError('VALIDATION', 'הפריט לא יכול להיות ריק');
      sh.getRange(row, T.TEXT + 1).setValue(asText(text));
    }
    if (p.done !== undefined && p.done !== null) sh.getRange(row, T.STATUS + 1).setValue(p.done ? TODO_DONE : TODO_OPEN);
    if (qtyGiven) sh.getRange(row, T.QTY + 1).setValue(qty ?? '');
    sh.getRange(row, T.UPDATED + 1, 1, 2).setValues([[new Date(), asText(ctx.who)]]);
    audit('todo.update', ctx, ctx.clientTxId, p);
  });
  return getTodos();
}

/** Delete = mark "נמחק"; the row stays for the record. */
export function deleteTodo(ctx: Ctx, todoId: string): Todo[] {
  withLock(() => {
    const sh = todoSheet();
    const row = findRow(sh, cleanText(todoId, 80));
    if (!row) return;
    sh.getRange(row, T.STATUS + 1).setValue(TODO_DELETED);
    sh.getRange(row, T.UPDATED + 1, 1, 2).setValues([[new Date(), asText(ctx.who)]]);
    audit('todo.delete', ctx, ctx.clientTxId, { todoId });
  });
  return getTodos();
}

/**
 * An inventory decrease of `delta` for `itemId`: counts up the item's open shortage line, or adds a new one.
 * Must be called **inside the caller's lock** (inventory.setAmount), so the two writes are one action.
 */
export function addShortageForItem(ctx: Ctx, itemId: string, name: string, delta: number): void {
  const sh = todoSheetForWrite();
  const last = sh.getLastRow();
  let open: { row: number; qty: number | null } | null = null;
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, TODO_HEADERS.length).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (fromText(rows[i][T.ITEM_ID]) === itemId && rows[i][T.STATUS] === TODO_OPEN) { open = { row: i + 2, qty: qtyOf(rows[i][T.QTY]) }; break; }
    }
  }
  const plan = planShortage(delta, open);
  const now = new Date();
  if (plan.kind === 'increase') {
    sh.getRange(plan.row, T.QTY + 1).setValue(plan.qty);
    sh.getRange(plan.row, T.UPDATED + 1, 1, 2).setValues([[now, asText(ctx.who)]]);
  } else if (plan.kind === 'create') {
    const id = 'S' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    sh.appendRow([asText(id), asText(name), TODO_OPEN, now, asText(ctx.who), now, asText(ctx.who), plan.qty, asText(itemId)]);
  }
  if (plan.kind !== 'none') audit('todo.fromInventory', ctx, ctx.clientTxId, { itemId, delta, plan });
}
