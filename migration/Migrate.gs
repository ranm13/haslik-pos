/**
 * העברת האפליקציה לחשבון ייעודי – הרצה חד-פעמית.
 *
 * מדביקים קובץ זה לפרויקט ה-Apps Script של **העותק** (בחשבון הייעודי) ומריצים מהעורך:
 *   1. migrateCheck      – בדיקה בלבד, לא משנה כלום. מדפיס מה נמצא ומה מסוכן.
 *   2. migrateTestRun    – הרצת ניסיון על עותק ניסיון: מעתיק דוחות ומאמת, בלי טריגרים.
 *   3. migrateFinalRun   – הרצה אמיתית: כמו 2 + יצירת טריגרים (סגירה יומית + גיבוי).
 *
 * עקרונות בטיחות:
 * - המקור (החשבון הפרטי) נפתח **לקריאה בלבד**. הסקריפט לא כותב אליו אף פעם.
 *   בנוסף, החשבון הייעודי מקבל למקור הרשאת **צפייה** בלבד, כך שגם טעות לא יכולה לשנות אותו.
 * - הסקריפט מסרב לרוץ אם הוא לא בחשבון הנכון, או אם הקובץ הפעיל הוא המקור עצמו.
 * - אפשר להריץ שוב בבטחה: דוחות שכבר הועתקו לחשבון הזה לא מועתקים פעמיים.
 */

// ===== למלא לפני הרצה =====
const MIGRATION = {
  // מזהה הספרדשיט המקורי בחשבון הפרטי (החלק שבין /d/ ל-/edit בכתובת)
  SOURCE_SPREADSHEET_ID: 'PASTE_SOURCE_SPREADSHEET_ID',
  // כתובת החשבון הייעודי. הסקריפט ירוץ רק כשהוא מחובר לחשבון הזה.
  EXPECTED_ACCOUNT: 'PASTE_DEDICATED_ACCOUNT@gmail.com',
};

const MIGRATION_SHEETS_ = ['יומן מכירות', 'יומן הוצאות', 'סוגי כרטיסיות', 'תקופות', 'חוסרים'];

/* ---------- נקודות כניסה ---------- */

function migrateCheck() {
  const ctx = migrationContext_();
  log_('חשבון מריץ: ' + ctx.me);
  log_('קובץ פעיל (העותק): ' + ctx.active.getName() + ' [' + ctx.active.getId() + ']');
  log_('קובץ מקור: ' + ctx.source.getName() + ' [' + ctx.source.getId() + '] – הרשאה: ' + ctx.sourceAccess);

  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.keys(props);
  log_('Script Properties שהועתקו: ' + (keys.length ? keys.join(', ') : 'אין'));
  if (props.MASTER_ID && props.MASTER_ID !== ctx.active.getId()) {
    log_('⚠️ MASTER_ID מצביע על קובץ אחר (' + props.MASTER_ID + '). בלי תיקון, האפליקציה תנסה לכתוב לשם. migrateTestRun/FinalRun מתקנים את זה.');
  }

  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  log_('טריגרים בפרויקט הזה: ' + (triggers.length ? triggers.join(', ') : 'אין'));

  checkMembersAccess_();
  verifyAgainstSource_(ctx);
  log_('✔ בדיקה הסתיימה. שום דבר לא שונה.');
}

function migrateTestRun() { runMigration_({ final: false }); }

function migrateFinalRun() { runMigration_({ final: true }); }

/* ---------- ההרצה עצמה ---------- */

function runMigration_(opts) {
  const ctx = migrationContext_();
  const label = opts.final ? 'הרצה אמיתית' : 'הרצת ניסיון';
  log_('▶ ' + label + ' – ' + ctx.me);

  // 1. ניקוי Script Properties שהועתקו מהמקור, והצבעה על הקובץ הזה בלבד
  const props = PropertiesService.getScriptProperties();
  const old = props.getProperties();
  log_('1/6 מוחק Script Properties שהועתקו: ' + (Object.keys(old).join(', ') || 'אין'));
  props.deleteAllProperties();
  props.setProperty('MASTER_ID', ctx.active.getId());

  // 2. תיקיות חדשות בחשבון הזה
  const parents = DriveApp.getFileById(ctx.active.getId()).getParents();
  const base = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const suffix = opts.final ? '' : ' (ניסיון)';
  const reports = ensureFolder_('REPORTS_FOLDER_ID', base, CONFIG.PUB_NAME + ' – דוחות חודשיים' + suffix);
  ensureFolder_('BACKUP_FOLDER_ID', base, CONFIG.PUB_NAME + ' – גיבויים' + suffix);
  log_('2/6 תיקיית דוחות: ' + reports.getUrl());

  // 3. העתקת הדוחות החודשיים ועדכון הקישורים בגיליון "תקופות"
  copyReports_(ctx, reports);

  // 4. אימות מול המקור
  const ok = verifyAgainstSource_(ctx);

  // 5. רשימת חברים
  checkMembersAccess_();

  // 6. טריגרים
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['dailyJob', 'backupJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  if (opts.final) {
    ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(CONFIG.CLOSE_HOUR).create();
    ScriptApp.newTrigger('backupJob').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();
    log_('6/6 טריגרים נוצרו: dailyJob (כל יום ב-' + CONFIG.CLOSE_HOUR + ':00), backupJob (ראשון 04:00)');
  } else {
    log_('6/6 הרצת ניסיון – לא נוצרו טריגרים (העותק הזה לא ישלח מיילים ולא יסגור חודש)');
  }

  if (CONFIG.ADMIN_EMAIL.toLowerCase() !== ctx.me.toLowerCase()) {
    log_('ℹ️ CONFIG.ADMIN_EMAIL הוא ' + CONFIG.ADMIN_EMAIL + ' (לא החשבון הזה). הדוח החודשי יישלח לשם, וכניסת מנהל בלי PIN תעבוד רק לחשבון ההוא.');
  }
  log_(ok ? '✔ ' + label + ' הסתיימה – כל הגיליונות זהים למקור.' : '✘ ' + label + ' הסתיימה עם פערים – ראה למעלה. לא לעבור לאפליקציה החדשה.');
}

function copyReports_(ctx, reportsFolder) {
  const sh = ctx.active.getSheetByName('תקופות');
  const rows = dataRows_(sh);
  let copied = 0, skipped = 0, missing = 0;
  rows.forEach((r, i) => {
    const row = i + 2;
    const id = String(r[P.REPORT_ID] || '');
    const status = r[P.STATUS];
    if (!id) return;
    let file;
    try { file = DriveApp.getFileById(id); } catch (e) {
      missing++;
      log_('  ⚠️ שורה ' + row + ': אין גישה לדוח ' + id + ' – יש לשתף את תיקיית הדוחות עם החשבון הזה');
      return;
    }
    const owner = file.getOwner();
    if (owner && owner.getEmail().toLowerCase() === ctx.me.toLowerCase()) { skipped++; return; } // כבר הועתק
    const copy = file.makeCopy(file.getName(), reportsFolder);
    sh.getRange(row, P.REPORT_ID + 1, 1, 2).setValues([[copy.getId(), copy.getUrl()]]);
    if (status === CLOSED) {
      try { lockReport_(SpreadsheetApp.openById(copy.getId())); } catch (e) { log_('  ⚠️ נעילת דוח ' + copy.getName() + ': ' + e); }
    }
    copied++;
  });
  SpreadsheetApp.flush();
  log_('3/6 דוחות: הועתקו ' + copied + ', כבר היו ' + skipped + ', חסרי גישה ' + missing);
}

/* ---------- אימות ---------- */

/** משווה כל גיליון לוגי למקור: מספר שורות + hash של כל הערכים המוצגים. לא כותב כלום. */
function verifyAgainstSource_(ctx) {
  let allOk = true;
  log_('אימות מול המקור:');
  MIGRATION_SHEETS_.forEach(name => {
    const a = ctx.source.getSheetByName(name);
    const b = ctx.active.getSheetByName(name);
    if (!a && !b) { log_('  – ' + name + ': לא קיים בשניהם'); return; }
    if (!a || !b) { allOk = false; log_('  ✘ ' + name + ': קיים רק ב' + (a ? 'מקור' : 'עותק')); return; }
    const va = a.getDataRange().getDisplayValues();
    const vb = b.getDataRange().getDisplayValues();
    // בגיליון "תקופות" עמודות הדוח משתנות בכוונה בהעתקה – משווים בלעדיהן
    const strip = name === 'תקופות'
      ? v => v.map(r => r.filter((_, c) => c !== P.REPORT_ID && c !== P.REPORT_URL))
      : v => v;
    const same = digest_(strip(va)) === digest_(strip(vb));
    if (!same) allOk = false;
    log_('  ' + (same ? '✔' : '✘') + ' ' + name + ': מקור ' + (va.length - 1) + ' שורות, עותק ' + (vb.length - 1) + ' שורות');
  });
  return allOk;
}

function digest_(values) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(values), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function checkMembersAccess_() {
  try {
    const n = getMembers_(true).length;
    log_('רשימת חברים: נקראו ' + n + ' חברים ✔');
  } catch (e) {
    log_('✘ רשימת חברים: ' + e.message + ' – יש לבקש מבעלי הקובץ לשתף אותו (צפייה) עם החשבון הזה. בלי זה האפליקציה לא תעלה.');
  }
}

/* ---------- הקשר ושמירות בטיחות ---------- */

function migrationContext_() {
  const me = Session.getEffectiveUser().getEmail() || '';
  if (MIGRATION.EXPECTED_ACCOUNT.indexOf('PASTE_') === 0 || MIGRATION.SOURCE_SPREADSHEET_ID.indexOf('PASTE_') === 0) {
    throw new Error('יש למלא את MIGRATION.SOURCE_SPREADSHEET_ID ו-MIGRATION.EXPECTED_ACCOUNT בראש הקובץ');
  }
  if (me.toLowerCase() !== MIGRATION.EXPECTED_ACCOUNT.toLowerCase()) {
    throw new Error('הסקריפט רץ בחשבון ' + me + ' ולא בחשבון הייעודי ' + MIGRATION.EXPECTED_ACCOUNT + '. עצירה.');
  }
  const active = SpreadsheetApp.getActive();
  if (!active) throw new Error('יש להריץ מתוך הסקריפט שמחובר לעותק (תוספים ← Apps Script מתוך הגיליון)');
  if (active.getId() === MIGRATION.SOURCE_SPREADSHEET_ID) {
    throw new Error('הקובץ הפעיל הוא המקור עצמו! יש להריץ רק בעותק. עצירה.');
  }
  const sourceFile = DriveApp.getFileById(MIGRATION.SOURCE_SPREADSHEET_ID);
  const access = String(sourceFile.getAccess(me));
  if (access === 'EDIT' || access === 'OWNER') {
    throw new Error('לחשבון הזה יש הרשאת ' + access + ' למקור. לביטחון, שתף את המקור בהרשאת "צפייה" בלבד ונסה שוב.');
  }
  return { me: me, active: active, source: SpreadsheetApp.openById(MIGRATION.SOURCE_SPREADSHEET_ID), sourceAccess: access };
}

function log_(s) { console.log(s); }
