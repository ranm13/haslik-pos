/**
 * Inventory (מלאי): items with an amount. Add, delete (soft), change amount.
 * Every decrease is added to the shortages list in the same locked action (D29).
 */
import type { InventoryItem, InventoryResult } from '../shared/api';
import { AppError } from '../core/errors';
import { shortageDelta, validateAmount, validateItemName } from '../core/inventory';
import { asText, cleanText, fromText } from '../core/text';
import { alreadyDone, audit, markDone } from './audit';
import type { Ctx } from './auth';
import { dataRows, findRow, withLock } from './sheets';
import { invSheet } from './stock';
import { ACTIVE, I, INVENTORY_HEADERS, ITEM_DELETED } from './schema';
import { addShortageForItem, getTodos } from './todos';
import { heCompare } from './util';

export function getInventory(): InventoryItem[] {
  return dataRows(invSheet(), INVENTORY_HEADERS.length)
    .filter(r => fromText(r[I.ID]) && r[I.STATUS] !== ITEM_DELETED)
    .map(r => ({ id: fromText(r[I.ID]), name: fromText(r[I.NAME]), amount: Number(r[I.AMOUNT]) || 0 }))
    .sort((a, b) => heCompare(a.name, b.name));
}

const result = (): InventoryResult => ({ inventory: getInventory(), todos: getTodos() });

export function createItem(ctx: Ctx, p: { name: string; amount: number } | undefined): InventoryResult {
  const name = validateItemName(p?.name);
  const amount = validateAmount(p?.amount);
  if (!ctx.clientTxId) throw new AppError('VALIDATION', 'בקשה לא תקינה (חסר מזהה)');
  withLock(() => {
    const sh = invSheet();
    if (alreadyDone(ctx.clientTxId, sh)) return;
    if (getInventory().some(it => it.name === name)) throw new AppError('CONFLICT', 'הפריט "' + name + '" כבר קיים במלאי');
    const now = new Date();
    sh.appendRow([asText(ctx.clientTxId), asText(name), amount, ACTIVE, now, now, asText(ctx.who)]);
    markDone(ctx.clientTxId);
    audit('inventory.create', ctx, ctx.clientTxId, { name, amount });
  });
  return result();
}

/**
 * Sets the absolute amount (the page sends the new total, never "+1"), so a retry can't double-count:
 * the decrease is computed against the stored amount inside the lock.
 */
export function setItemAmount(ctx: Ctx, p: { itemId: string; amount: number } | undefined): InventoryResult {
  const id = cleanText(p?.itemId, 80);
  const after = validateAmount(p?.amount);
  withLock(() => {
    const sh = invSheet();
    const row = findRow(sh, id);
    if (!row) throw new AppError('NOT_FOUND', 'הפריט לא נמצא');
    const r = sh.getRange(row, 1, 1, INVENTORY_HEADERS.length).getValues()[0];
    if (r[I.STATUS] === ITEM_DELETED) throw new AppError('CONFLICT', 'הפריט נמחק');
    const before = Number(r[I.AMOUNT]) || 0;
    if (before === after) return;
    sh.getRange(row, I.AMOUNT + 1).setValue(after);
    sh.getRange(row, I.UPDATED + 1, 1, 2).setValues([[new Date(), asText(ctx.who)]]);
    audit('inventory.setAmount', ctx, ctx.clientTxId, { itemId: id, before, after });
    const delta = shortageDelta(before, after);
    if (delta) addShortageForItem(ctx, id, fromText(r[I.NAME]), delta);
  });
  return result();
}

/** Delete = mark "נמחק"; the row stays for the record. Its shortage lines are left as they are. */
export function deleteItem(ctx: Ctx, itemId: string | undefined): InventoryResult {
  const id = cleanText(itemId, 80);
  withLock(() => {
    const sh = invSheet();
    const row = findRow(sh, id);
    if (!row) return;
    sh.getRange(row, I.STATUS + 1).setValue(ITEM_DELETED);
    sh.getRange(row, I.UPDATED + 1, 1, 2).setValues([[new Date(), asText(ctx.who)]]);
    audit('inventory.delete', ctx, ctx.clientTxId, { itemId: id });
  });
  return result();
}
