/**
 * התקנה, משימות מתוזמנות, גיבוי ותפריט.
 */

/* ---------- תפריט בקובץ המערכת ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🍺 הסליק')
    .addItem('רענון הדוח של החודש הנוכחי', 'menuRefresh')
    .addItem('גיבוי עכשיו', 'backupJob')
    .addSeparator()
    .addItem('סגירת החודש עכשיו (ידני)…', 'menuCloseNow')
    .addItem('התקנה / תיקון (setup)', 'setup')
    .addToUi();
}

function menuRefresh() {
  const p = getOpenPeriod_();
  buildReport_(p, false);
  SpreadsheetApp.getActive().toast('הדוח עודכן: ' + p.title, 'הסליק', 5);
}

function menuCloseNow() {
  const ui = SpreadsheetApp.getUi();
  const p = getOpenPeriod_();
  const ans = ui.alert('סגירת חודש', 'לסגור עכשיו את "' + p.title + '", לשלוח את הדוח ולפתוח חודש חדש?', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  closePeriod_(p, new Date());
  ui.alert('החודש נסגר והדוח נשלח ל-' + CONFIG.ADMIN_EMAIL);
}

/* ---------- משימה יומית (כל בוקר ב-08:00) ---------- */

function dailyJob() {
  const now = new Date();
  let p = getOpenPeriod_();
  if (!p) {
    withLock_(() => { if (!getOpenPeriod_()) appendOpenPeriod_(monthKey_(now), now); });
    buildReport_(getOpenPeriod_(), false);
    return;
  }
  if (shouldClose_(p, now)) {
    closePeriod_(p, now);
  } else {
    buildReport_(p, false); // רענון יומי של הטיוטה
  }
}

function appendOpenPeriod_(key, start) {
  sheet_(SHEETS.PERIODS).appendRow([asText_(key), asText_(periodTitle_(key)), start, '', '', '', OPEN]);
}

/**
 * סוגר את החודש: מכאן והלאה כל רישום חדש נכנס לחודש הבא.
 * ואז: דוח סופי, נעילה, מייל, ויצירת קובץ לחודש החדש.
 */
function closePeriod_(p, now) {
  const thisKey = monthKey_(now);
  let nextKey = (isLastDayOfMonth_(now) && Number(fmt_(now, 'H')) >= CONFIG.CLOSE_HOUR) ? nextMonthKey_(thisKey) : thisKey;
  if (nextKey <= p.key) nextKey = nextMonthKey_(p.key);

  withLock_(() => {
    const current = getOpenPeriod_();
    if (!current || current.key !== p.key) return; // כבר נסגר
    sheet_(SHEETS.PERIODS).getRange(p.row, P.END + 1).setValue(now);
    sheet_(SHEETS.PERIODS).getRange(p.row, P.STATUS + 1).setValue(CLOSED);
    if (!getPeriodByKey_(nextKey)) appendOpenPeriod_(nextKey, now);
  });

  const errors = [];
  const closed = getPeriodByKey_(p.key);
  let result = null;
  try { result = buildReport_(closed, true); } catch (e) { errors.push('בניית דוח: ' + e); }
  if (result) {
    try { lockReport_(result.book); } catch (e) { errors.push('נעילה: ' + e); }
    try { emailReport_(closed, result); } catch (e) { errors.push('מייל: ' + e); }
  }
  try { buildReport_(getOpenPeriod_(), false); } catch (e) { errors.push('דוח חודש חדש: ' + e); }
  // שגיאה נזרקת כדי ש-Google ישלח לך התראה על כישלון המשימה
  if (errors.length) throw new Error('סגירת חודש ' + p.title + ' – בעיות: ' + errors.join(' | '));
}

/* ---------- גיבוי שבועי ---------- */

function backupJob() {
  const folderId = props_().getProperty('BACKUP_FOLDER_ID');
  if (!folderId) throw new Error('אין תיקיית גיבוי. הרץ setup.');
  const folder = DriveApp.getFolderById(folderId);
  const master = DriveApp.getFileById(ss_().getId());
  master.makeCopy('גיבוי ' + master.getName() + ' ' + fmt_(new Date(), 'yyyy-MM-dd HH-mm'), folder);

  const cutoff = Date.now() - CONFIG.BACKUP_KEEP_DAYS * 24 * 3600 * 1000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated().getTime() < cutoff) f.setTrashed(true); // לסל המחזור, לא מחיקה סופית
  }
}

/* ---------- בדיקת התקנה ---------- */

/** מריצים אם setup לא עושה כלום: בודק שכל הקבצים הודבקו ושאין כפילויות */
function checkInstall() {
  const parts = {
    'Config.gs': typeof CONFIG !== 'undefined',
    'Core.gs': typeof getMembers_ === 'function' && typeof readXlsxSheet_ === 'function',
    'Api.gs': typeof api_sell === 'function' && typeof doGet === 'function',
    'Report.gs': typeof buildReport_ === 'function',
    'Setup.gs': typeof ensureSheet_ === 'function',
  };
  Object.keys(parts).forEach(k => console.log((parts[k] ? '✔ ' : '✘ חסר: ') + k));
  console.log('אורך הפונקציה setup: ' + setup.toString().length + ' תווים (תקין: יותר מ-3000)');
  console.log('קובץ מחובר: ' + (SpreadsheetApp.getActive() ? SpreadsheetApp.getActive().getName() : 'אין – הסקריפט לא נוצר מתוך הגיליון'));
  try { HtmlService.createHtmlOutputFromFile('Index'); console.log('✔ Index.html'); }
  catch (e) { console.log('✘ חסר: Index.html (צריך להיות קובץ HTML בשם Index)'); }
  console.log('אזור זמן: ' + Session.getScriptTimeZone() + ' (תקין: Asia/Jerusalem)');
}

/* ---------- התקנה (להריץ פעם אחת מהעורך) ---------- */

function setup() {
  console.log('▶ setup התחיל');
  const ss = SpreadsheetApp.getActive();
  console.log('1/7 קובץ המערכת: ' + (ss ? ss.getName() : 'לא נמצא!'));
  if (!ss) throw new Error('יש להריץ את setup מתוך הסקריפט שמחובר לקובץ המערכת');
  props_().setProperty('MASTER_ID', ss.getId());
  ss.setSpreadsheetTimeZone(tz_());

  ensureSheet_(ss, SHEETS.SALES, SALES_HEADERS, [S.QTY, S.PRICE, S.TOTAL], { 2: 'dd/MM/yyyy HH:mm:ss' });
  ensureSheet_(ss, SHEETS.EXPENSES, EXPENSE_HEADERS, [E.AMOUNT], { 2: 'dd/MM/yyyy HH:mm:ss', 4: 'dd/MM/yyyy' });
  console.log('2/7 לשוניות היומן נוצרו');
  const types = ensureSheet_(ss, SHEETS.TYPES, TYPES_HEADERS, [1], {});
  if (types.getLastRow() < 2) {
    types.getRange(2, 1, 1, 3).setValues([['רגילה', 50, true]]);
  }
  types.getRange(2, 3, 50, 1).setNumberFormat('General').insertCheckboxes();
  types.getRange(2, 2, 50, 1).setNumberFormat('₪#,##0');
  ensureSheet_(ss, SHEETS.PERIODS, PERIOD_HEADERS, [], { 3: 'dd/MM/yyyy HH:mm', 4: 'dd/MM/yyyy HH:mm' });
  ensureSheet_(ss, SHEETS.TODO, TODO_HEADERS, [], { 4: 'dd/MM/yyyy HH:mm', 6: 'dd/MM/yyyy HH:mm' });

  // הגנה מעריכה ידנית בטעות ביומנים (אזהרה בלבד)
  [SHEETS.SALES, SHEETS.EXPENSES, SHEETS.PERIODS, SHEETS.TODO].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      sh.protect().setWarningOnly(true).setDescription('נכתב ע"י האפליקציה – לא לערוך ידנית');
    }
  });

  // מחיקת גיליון ברירת מחדל ריק
  ['Sheet1', 'גיליון1', 'גיליון 1'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  console.log('3/7 לשוניות מוכנות');
  // תיקיות
  const parents = DriveApp.getFileById(ss.getId()).getParents();
  const base = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const reports = ensureFolder_('REPORTS_FOLDER_ID', base, CONFIG.PUB_NAME + ' – דוחות חודשיים');
  ensureFolder_('BACKUP_FOLDER_ID', base, CONFIG.PUB_NAME + ' – גיבויים');
  CONFIG.FINANCE_EMAILS.forEach(m => { try { reports.addViewer(m); } catch (e) { console.warn(e); } });

  console.log('4/7 תיקיות: ' + reports.getUrl());
  // בדיקת חיבור לרשימת החברים
  const members = getMembers_(true);
  console.log('5/7 נקראו ' + members.length + ' חברים מהלשונית "' + CONFIG.MEMBERS_TAB_NAME + '"');

  // טריגרים
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['dailyJob', 'backupJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(CONFIG.CLOSE_HOUR).create();
  ScriptApp.newTrigger('backupJob').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();

  console.log('6/7 משימות מתוזמנות נוצרו');
  // חודש ראשון
  if (!getOpenPeriod_()) {
    const now = new Date();
    appendOpenPeriod_(monthKey_(now), now);
    buildReport_(getOpenPeriod_(), false);
  }

  console.log('7/7 דוח החודש מוכן');
  const access = membersAccessLevel_();
  const accessMsg = (access === 'EDIT' || access === 'OWNER')
    ? '⚠️ לחשבון שלך יש הרשאת עריכה לקובץ החברים. המערכת רק קוראת ממנו, אבל לביטחון מלא בקש מהבעלים לשנות את ההרשאה שלך ל"צפייה".'
    : 'גישה לקובץ החברים: קריאה בלבד ✔';

  const p = getOpenPeriod_();
  const msg = 'ההתקנה הושלמה ✔\n' +
    'חברים ברשימה: ' + members.length + '\n' +
    accessMsg + '\n' +
    'חודש פתוח: ' + p.title + '\n' +
    'דוח: ' + p.reportUrl;
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* הורץ מהעורך */ }
}

function ensureSheet_(ss, name, headers, numberCols, dateFormats) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground(COLORS.header).setFontColor(COLORS.headerText);
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  // כל העמודות טקסט, חוץ ממספרים ותאריכים
  sh.getRange(2, 1, sh.getMaxRows() - 1, headers.length).setNumberFormat('@');
  numberCols.forEach(i => sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('#,##0.##'));
  Object.keys(dateFormats).forEach(c => sh.getRange(2, Number(c), sh.getMaxRows() - 1, 1).setNumberFormat(dateFormats[c]));
  return sh;
}

function ensureFolder_(propKey, parent, name) {
  const id = props_().getProperty(propKey);
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* נמחקה */ }
  }
  const existing = parent.getFoldersByName(name);
  const folder = existing.hasNext() ? existing.next() : parent.createFolder(name);
  props_().setProperty(propKey, folder.getId());
  return folder;
}
