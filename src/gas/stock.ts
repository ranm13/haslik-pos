/**
 * Low-level access to the inventory sheet, shared by inventory.ts and todos.ts (no import cycle).
 * restockItem must be called inside the caller's lock.
 */
import { applyRestock } from '../core/inventory';
import { asText, fromText } from '../core/text';
import { audit } from './audit';
import type { Ctx } from './auth';
import { findRow, sheetOrCreate } from './sheets';
import { I, INVENTORY_HEADERS, ITEM_DELETED, SHEETS } from './schema';

export const invSheet = () => sheetOrCreate(SHEETS.INVENTORY, INVENTORY_HEADERS, [I.AMOUNT], { 5: 'dd/MM/yyyy HH:mm', 6: 'dd/MM/yyyy HH:mm' });

/**
 * Adds `delta` (negative = takes back) to an item's amount, never below 0. Does NOT create shortage lines,
 * so ticking / unticking "נקנה" can't loop back into חוסרים. Returns the item's name, or '' if it's gone.
 */
export function restockItem(ctx: Ctx, itemId: string, delta: number): string {
  if (!itemId || !delta) return '';
  const sh = invSheet();
  const row = findRow(sh, itemId);
  if (!row) return '';
  const r = sh.getRange(row, 1, 1, INVENTORY_HEADERS.length).getValues()[0];
  if (r[I.STATUS] === ITEM_DELETED) return '';
  const before = Number(r[I.AMOUNT]) || 0;
  const after = applyRestock(before, delta);
  sh.getRange(row, I.AMOUNT + 1).setValue(after);
  sh.getRange(row, I.UPDATED + 1, 1, 2).setValues([[new Date(), asText(ctx.who)]]);
  audit('inventory.restock', ctx, ctx.clientTxId, { itemId, delta, before, after });
  return fromText(r[I.NAME]);
}
