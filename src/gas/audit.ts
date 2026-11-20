import { asText } from '../core/text';
import { IDEMPOTENCY_TTL_S } from './config';
import { ensureSheet, findRow } from './sheets';
import { AUDIT_HEADERS, SHEETS } from './schema';
import { cache } from './util';

export interface Actor { who: string }

let auditSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;

/** Append-only audit trail; every write action logs one row (ROADMAP §8). */
export function audit(action: string, actor: Actor, clientTxId: string, payload: unknown): void {
  if (!auditSheet) auditSheet = ensureSheet(SHEETS.AUDIT, AUDIT_HEADERS, [], { 1: 'dd/MM/yyyy HH:mm:ss' });
  let json = '';
  try { json = JSON.stringify(payload === undefined ? null : payload); } catch { json = '"<unserializable>"'; }
  auditSheet.appendRow([new Date(), asText(action), asText(actor.who), asText(clientTxId || ''), asText(json.slice(0, 2000))]);
}

/**
 * Idempotency check, to be called **inside the script lock**.
 * True if this clientTxId was already processed (cache first, then the id column of `sh`).
 */
export function alreadyDone(clientTxId: string, sh?: GoogleAppsScript.Spreadsheet.Sheet, col = 1): boolean {
  if (!clientTxId) return false;
  if (cache().get('tx:' + clientTxId)) return true;
  return !!(sh && findRow(sh, clientTxId, col));
}

export function markDone(clientTxId: string): void {
  if (clientTxId) cache().put('tx:' + clientTxId, '1', IDEMPOTENCY_TTL_S);
}
