import type { Todo } from '../shared/api';
import { AppError } from '../core/errors';
import { asText, cleanText, fromText } from '../core/text';
import { alreadyDone, audit, markDone } from './audit';
import type { Ctx } from './auth';
import { dataRows, findRow, sheetOrCreate, withLock } from './sheets';
import { SHEETS, T, TODO_DELETED, TODO_DONE, TODO_HEADERS, TODO_OPEN } from './schema';
import { fmt, toDate } from './util';

const todoSheet = () => ensureSheetOnce();
let todoMemo: GoogleAppsScript.Spreadsheet.Sheet | null = null;
function ensureSheetOnce() {
  if (!todoMemo) todoMemo = sheetOrCreate(SHEETS.TODO, TODO_HEADERS, [], { 4: 'dd/MM/yyyy HH:mm', 6: 'dd/MM/yyyy HH:mm' });
  return todoMemo;
}

export function getTodos(): Todo[] {
  const rows = dataRows(todoSheet(), TODO_HEADERS.length).filter(r => r[T.STATUS] !== TODO_DELETED && fromText(r[T.ID]));
  const all = rows.map(r => {
    const created = toDate(r[T.CREATED]);
    const updated = r[T.UPDATED] instanceof Date ? r[T.UPDATED] as Date : created;
    return { id: fromText(r[T.ID]), text: fromText(r[T.TEXT]), done: r[T.STATUS] === TODO_DONE, date: fmt(created, 'dd/MM'), c: created.getTime(), u: updated.getTime() };
  });
  const open = all.filter(x => !x.done).sort((a, b) => b.c - a.c);            // newest first
  const done = all.filter(x => x.done).sort((a, b) => b.u - a.u).slice(0, 25); // last 25 bought
  return open.concat(done).map(({ c: _c, u: _u, ...t }) => t);
}

export function createTodo(ctx: Ctx, text: string): Todo[] {
  const t = cleanText(text, 120);
  if (!t) throw new AppError('VALIDATION', 'יש להזין פריט');
  if (!ctx.clientTxId) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  withLock(() => {
    const sh = todoSheet();
    if (alreadyDone(ctx.clientTxId, sh)) return;
    const now = new Date();
    sh.appendRow([asText(ctx.clientTxId), asText(t), TODO_OPEN, now, asText(ctx.who), now, asText(ctx.who)]);
    markDone(ctx.clientTxId);
    audit('todo.create', ctx, ctx.clientTxId, { text: t });
  });
  return getTodos();
}

export function updateTodo(ctx: Ctx, p: { todoId: string; text?: string; done?: boolean } | undefined): Todo[] {
  if (!p) throw new AppError('VALIDATION', 'בקשה לא תקינה');
  withLock(() => {
    const sh = todoSheet();
    const row = findRow(sh, cleanText(p.todoId, 80));
    if (!row) throw new AppError('NOT_FOUND', 'הפריט לא נמצא');
    if (sh.getRange(row, T.STATUS + 1).getValue() === TODO_DELETED) throw new AppError('CONFLICT', 'מישהו אחר כבר מחק את הפריט');
    if (p.text !== undefined && p.text !== null) {
      const text = cleanText(p.text, 120);
      if (!text) throw new AppError('VALIDATION', 'הפריט לא יכול להיות ריק');
      sh.getRange(row, T.TEXT + 1).setValue(asText(text));
    }
    if (p.done !== undefined && p.done !== null) sh.getRange(row, T.STATUS + 1).setValue(p.done ? TODO_DONE : TODO_OPEN);
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
