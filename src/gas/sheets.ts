import { AppError } from '../core/errors';
import { getProp, LOCK_WAIT_MS, PROP } from './config';

export type Row = unknown[];

let ssMemo: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

/** The system spreadsheet (MASTER_ID), falling back to the bound container. */
export function ss(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  if (ssMemo) return ssMemo;
  const id = getProp(PROP.MASTER_ID);
  ssMemo = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ssMemo) throw new AppError('NOT_CONFIGURED', 'המערכת עוד לא הוגדרה (MASTER_ID חסר)');
  return ssMemo;
}

export function resetSsMemo(): void { ssMemo = null; }

export function sheet(name: string): GoogleAppsScript.Spreadsheet.Sheet {
  const sh = ss().getSheetByName(name);
  if (!sh) throw new AppError('NOT_CONFIGURED', 'הגיליון "' + name + '" חסר. יש להריץ setup.');
  return sh;
}

export function maybeSheet(name: string): GoogleAppsScript.Spreadsheet.Sheet | null {
  return ss().getSheetByName(name);
}

export function dataRows(sh: GoogleAppsScript.Spreadsheet.Sheet, width?: number): Row[] {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width || sh.getLastColumn()).getValues();
}

/** Last `n` data rows with their sheet row numbers (for "recent" views without reading the whole log). */
export function tailRows(sh: GoogleAppsScript.Spreadsheet.Sheet, n: number, width: number): { row: number; values: Row }[] {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const count = Math.min(n, last - 1);
  const start = last - count + 1;
  return sh.getRange(start, 1, count, width).getValues().map((values, i) => ({ row: start + i, values }));
}

/** Row number of the exact id in column `col` (1-based), or 0. Uses TextFinder (server-side, fast). */
export function findRow(sh: GoogleAppsScript.Spreadsheet.Sheet, id: string, col = 1): number {
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const cell = sh.getRange(2, col, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

export function withLock<T>(fn: () => T): T {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new AppError('BUSY', 'המערכת עמוסה כרגע, נסה שוב בעוד רגע');
  try { return fn(); } finally { lock.releaseLock(); }
}

export const COLORS = {
  header: '#1e4d3a', headerText: '#ffffff',
  band: '#f3f8f5', total: '#d9ead3',
  income: '#b7e1cd', expense: '#f4c7c3', border: '#9aa5a0',
};

/**
 * Fast path for request handlers: the sheet if it exists (one cheap call); the full ensureSheet only
 * when it's missing. ensureSheet rewrites formats on every row, so it must not run on every request.
 */
export function sheetOrCreate(name: string, headers: string[], numberCols: number[] = [], dateFormats: Record<number, string> = {}): GoogleAppsScript.Spreadsheet.Sheet {
  return ss().getSheetByName(name) || ensureSheet(name, headers, numberCols, dateFormats);
}

/** Writes trailing header cells that are missing (a column added by a later stage), without touching formats. */
export function addMissingHeaders(sh: GoogleAppsScript.Spreadsheet.Sheet, headers: string[]): void {
  const have = sh.getLastColumn();
  if (have >= headers.length) return;
  sh.getRange(1, have + 1, 1, headers.length - have).setValues([headers.slice(have)]);
}

/** Creates the sheet if missing, writes headers if empty, appends missing trailing headers (schema growth). */
export function ensureSheet(name: string, headers: string[], numberCols: number[] = [], dateFormats: Record<number, string> = {}): GoogleAppsScript.Spreadsheet.Sheet {
  const book = ss();
  let sh = book.getSheetByName(name);
  if (!sh) sh = book.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    for (let i = current.length; i < headers.length; i++) sh.getRange(1, i + 1).setValue(headers[i]);
  }
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground(COLORS.header).setFontColor(COLORS.headerText);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  const rows = sh.getMaxRows() - 1;
  if (rows > 0) {
    sh.getRange(2, 1, rows, headers.length).setNumberFormat('@');
    numberCols.forEach(i => sh!.getRange(2, i + 1, rows, 1).setNumberFormat('#,##0.##'));
    Object.keys(dateFormats).forEach(c => sh!.getRange(2, Number(c), rows, 1).setNumberFormat(dateFormats[Number(c)]));
  }
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sh.protect().setWarningOnly(true).setDescription('נכתב ע"י האפליקציה – לא לערוך ידנית');
  }
  return sh;
}
