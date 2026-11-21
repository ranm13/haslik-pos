/**
 * Setup, scheduled jobs and spreadsheet menu (port of legacy Setup.gs).
 */
import { validatePinFormat, validatePinPair } from '../core/auth';
import { fileIdFromUrl } from '../core/text';
import { monthKey, nextPeriodKeyOnClose, shouldClose } from '../core/time';
import { hashPin } from './auth';
import { BACKUP_KEEP_DAYS, CLOSE_HOUR, deleteProp, getProp, PROP, PUB_NAME, setProps } from './config';
import { readExternalMembers } from './external';
import { appendOpenPeriod, getOpenPeriod, getPeriodByKey, type PeriodRow } from './periods';
import { buildReport, emailReport, lockReport } from './report';
import { ensureSheet, resetSsMemo, sheet, ss, withLock } from './sheets';
import {
  AUDIT_HEADERS, CLOSED, E, EXPENSE_HEADERS, P, PERIOD_HEADERS, S, SALES_HEADERS, SHEETS,
  TODO_HEADERS, TYPES_HEADERS,
} from './schema';
import { schemaExtensions } from './extensions';
import { fmt, randomToken, tz } from './util';

/* ---------- setup (run from the editor or the spreadsheet menu) ---------- */

/**
 * Idempotent. Points the app at the bound spreadsheet, turns one-time INITIAL_* PIN properties
 * into hashes (and deletes the plain values), creates missing sheets, folders, triggers and the open month.
 */
export function setup(): string[] {
  const log: string[] = [];
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('יש להריץ את setup מתוך הסקריפט שמחובר לקובץ המערכת');
  setProps({ [PROP.MASTER_ID]: book.getId() });
  resetSsMemo();
  book.setSpreadsheetTimeZone(tz());
  log.push('✔ קובץ המערכת: ' + book.getName());

  log.push(...configurePins());
  if (!getProp(PROP.ADMIN_EMAIL)) setProps({ [PROP.ADMIN_EMAIL]: Session.getEffectiveUser().getEmail() });
  const membersUrl = getProp(PROP.MEMBERS_URL);
  if (membersUrl) {
    const id = fileIdFromUrl(membersUrl);
    if (id) { setProps({ [PROP.MEMBERS_FILE_ID]: id }); deleteProp(PROP.MEMBERS_URL); }
    else log.push('✘ MEMBERS_URL לא תקין – יש להדביק את הקישור המלא לקובץ');
  }

  ensureSheet(SHEETS.SALES, SALES_HEADERS, [S.QTY, S.PRICE, S.TOTAL], { 2: 'dd/MM/yyyy HH:mm:ss' });
  ensureSheet(SHEETS.EXPENSES, EXPENSE_HEADERS, [E.AMOUNT], { 2: 'dd/MM/yyyy HH:mm:ss', 4: 'dd/MM/yyyy' });
  const types = ensureSheet(SHEETS.TYPES, TYPES_HEADERS, [1], {});
  if (types.getLastRow() < 2) types.getRange(2, 1, 1, 3).setValues([['רגילה', 50, true]]);
  types.getRange(2, 3, 50, 1).setNumberFormat('General').insertCheckboxes();
  types.getRange(2, 2, 50, 1).setNumberFormat('₪#,##0');
  ensureSheet(SHEETS.PERIODS, PERIOD_HEADERS, [], { 3: 'dd/MM/yyyy HH:mm', 4: 'dd/MM/yyyy HH:mm' });
  ensureSheet(SHEETS.TODO, TODO_HEADERS, [], { 4: 'dd/MM/yyyy HH:mm', 6: 'dd/MM/yyyy HH:mm' });
  ensureSheet(SHEETS.AUDIT, AUDIT_HEADERS, [], { 1: 'dd/MM/yyyy HH:mm:ss' });
  log.push(...schemaExtensions());
  ['Sheet1', 'גיליון1', 'גיליון 1'].forEach(n => {
    const sh = book.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(sh);
  });
  log.push('✔ לשוניות מוכנות');

  const parents = DriveApp.getFileById(book.getId()).getParents();
  const base = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const reports = ensureFolder(PROP.REPORTS_FOLDER_ID, base, PUB_NAME + ' – דוחות חודשיים');
  ensureFolder(PROP.BACKUP_FOLDER_ID, base, PUB_NAME + ' – גיבויים');
  getProp(PROP.FINANCE_EMAILS).split(',').map(s => s.trim()).filter(Boolean)
    .forEach(m => { try { reports.addViewer(m); } catch (e) { console.warn(e); } });
  log.push('✔ תיקיית דוחות: ' + reports.getUrl());

  try {
    log.push('✔ רשימת חברים: נקראו ' + readExternalMembers(true).length + ' חברים');
  } catch (e) {
    log.push('✘ רשימת חברים: ' + ((e as Error)?.message || e));
  }

  ScriptApp.getProjectTriggers().forEach(t => {
    if (['dailyJob', 'backupJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(CLOSE_HOUR).create();
  ScriptApp.newTrigger('backupJob').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();
  log.push('✔ טריגרים: dailyJob (' + CLOSE_HOUR + ':00), backupJob (ראשון 04:00)');

  if (!getOpenPeriod()) {
    const now = new Date();
    appendOpenPeriod(monthKey(fmt, now), now);
    buildReport(getOpenPeriod()!, false);
  }
  log.push('✔ חודש פתוח: ' + getOpenPeriod()!.title);
  return log;
}

/** Hashes INITIAL_BAR_PIN / INITIAL_ADMIN_PIN if present, then deletes the plain values. */
function configurePins(): string[] {
  if (!getProp(PROP.PIN_SALT)) setProps({ [PROP.PIN_SALT]: randomToken() });
  const barIn = getProp(PROP.INITIAL_BAR_PIN);
  const adminIn = getProp(PROP.INITIAL_ADMIN_PIN);
  const log: string[] = [];
  if (barIn || adminIn) {
    try {
      const bar = barIn ? validatePinFormat(barIn, 'קוד בר') : '';
      const admin = adminIn ? validatePinFormat(adminIn, 'קוד מנהל') : '';
      if (bar && admin) validatePinPair(bar, admin);
      const sameAsOther = (bar && !admin && hashPin(bar) === getProp(PROP.ADMIN_PIN_HASH)) ||
        (admin && !bar && hashPin(admin) === getProp(PROP.BAR_PIN_HASH));
      if (sameAsOther) throw new Error('קוד הבר וקוד המנהל חייבים להיות שונים');
      const update: Record<string, string> = {};
      if (bar) update[PROP.BAR_PIN_HASH] = hashPin(bar);
      if (admin) update[PROP.ADMIN_PIN_HASH] = hashPin(admin);
      setProps(update);
      log.push('✔ קודים עודכנו: ' + [bar ? 'בר' : '', admin ? 'מנהל' : ''].filter(Boolean).join(' + '));
    } catch (e) {
      log.push('✘ קודים: ' + ((e as Error)?.message || e) + ' – הקודים לא שונו');
    }
    // never leave plain PINs behind, even if they were invalid
    deleteProp(PROP.INITIAL_BAR_PIN);
    deleteProp(PROP.INITIAL_ADMIN_PIN);
  }
  if (!getProp(PROP.BAR_PIN_HASH) || !getProp(PROP.ADMIN_PIN_HASH)) {
    log.push('✘ חסרים קודים: הוסף INITIAL_BAR_PIN ו-INITIAL_ADMIN_PIN ב-Project Settings → Script Properties והרץ setup שוב');
  } else if (!log.length) {
    log.push('✔ קודים מוגדרים');
  }
  return log;
}


function ensureFolder(propKey: string, parent: GoogleAppsScript.Drive.Folder, name: string): GoogleAppsScript.Drive.Folder {
  const id = getProp(propKey);
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch { /* deleted */ }
  }
  const existing = parent.getFoldersByName(name);
  const folder = existing.hasNext() ? existing.next() : parent.createFolder(name);
  setProps({ [propKey]: folder.getId() });
  return folder;
}

/* ---------- daily job (every morning at 08:00) ---------- */

export function dailyJob(): void {
  const now = new Date();
  const p = getOpenPeriod();
  if (!p) {
    withLock(() => { if (!getOpenPeriod()) appendOpenPeriod(monthKey(fmt, now), now); });
    buildReport(getOpenPeriod()!, false);
    return;
  }
  if (shouldClose(fmt, p.key, now, CLOSE_HOUR)) closePeriod(p, now);
  else buildReport(p, false); // daily draft refresh
}

/** From now on every new record goes to the next month. Then: final report, lock, mail, next month's draft. */
export function closePeriod(p: PeriodRow, now: Date): void {
  const nextKey = nextPeriodKeyOnClose(fmt, p.key, now, CLOSE_HOUR);
  withLock(() => {
    const current = getOpenPeriod();
    if (!current || current.key !== p.key) return; // already closed
    const sh = sheet(SHEETS.PERIODS);
    sh.getRange(p.row, P.END + 1).setValue(now);
    sh.getRange(p.row, P.STATUS + 1).setValue(CLOSED);
    if (!getPeriodByKey(nextKey)) appendOpenPeriod(nextKey, now);
  });
  const errors: string[] = [];
  const closed = getPeriodByKey(p.key)!;
  let result = null;
  try { result = buildReport(closed, true); } catch (e) { errors.push('בניית דוח: ' + e); }
  if (result) {
    try { lockReport(result.book); } catch (e) { errors.push('נעילה: ' + e); }
    try { emailReport(closed, result); } catch (e) { errors.push('מייל: ' + e); }
  }
  try { buildReport(getOpenPeriod()!, false); } catch (e) { errors.push('דוח חודש חדש: ' + e); }
  // throw so Google emails a failure notice for the trigger
  if (errors.length) throw new Error('סגירת חודש ' + p.title + ' – בעיות: ' + errors.join(' | '));
}

/* ---------- weekly backup ---------- */

export function backupJob(): void {
  const folderId = getProp(PROP.BACKUP_FOLDER_ID);
  if (!folderId) throw new Error('אין תיקיית גיבוי. הרץ setup.');
  const folder = DriveApp.getFolderById(folderId);
  const master = DriveApp.getFileById(ss().getId());
  master.makeCopy('גיבוי ' + master.getName() + ' ' + fmt(new Date(), 'yyyy-MM-dd HH-mm'), folder);
  const cutoff = Date.now() - BACKUP_KEEP_DAYS * 24 * 3600 * 1000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated().getTime() < cutoff) f.setTrashed(true); // trash, not permanent delete
  }
}

/* ---------- spreadsheet menu ---------- */

export function onOpen(): void {
  SpreadsheetApp.getUi().createMenu('🍺 הסליק')
    .addItem('רענון הדוח של החודש הנוכחי', 'menuRefresh')
    .addItem('גיבוי עכשיו', 'backupJob')
    .addSeparator()
    .addItem('סגירת החודש עכשיו (ידני)…', 'menuCloseNow')
    .addItem('התקנה / תיקון (setup)', 'setup')
    .addToUi();
}

export function menuRefresh(): void {
  const p = getOpenPeriod();
  if (!p) return;
  buildReport(p, false);
  SpreadsheetApp.getActive().toast('הדוח עודכן: ' + p.title, 'הסליק', 5);
}

export function menuCloseNow(): void {
  const ui = SpreadsheetApp.getUi();
  const p = getOpenPeriod();
  if (!p) return;
  const ans = ui.alert('סגירת חודש', 'לסגור עכשיו את "' + p.title + '", לשלוח את הדוח ולפתוח חודש חדש?', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  closePeriod(p, new Date());
  ui.alert('החודש נסגר והדוח נשלח ל-' + getProp(PROP.ADMIN_EMAIL));
}

