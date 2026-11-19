/**
 * ליבה: שמות גיליונות, עמודות, תקופות (חודשים) וגישה לנתונים.
 * אין צורך לערוך קובץ זה.
 */

const SHEETS = {
  SALES: 'יומן מכירות',
  EXPENSES: 'יומן הוצאות',
  TYPES: 'סוגי כרטיסיות',
  PERIODS: 'תקופות',
  TODO: 'חוסרים',
};

const SALES_HEADERS = ['מזהה', 'זמן רישום', 'חודש', 'תאריך משמרת', 'שם משפחה', 'שם פרטי', 'מפתח חבר',
  'ברשימה', 'סוג כרטיסייה', 'כמות', 'מחיר יחידה', 'סה"כ', 'הערות', 'נרשם ע"י', 'סטטוס', 'בוטל בזמן', 'בוטל ע"י'];
const S = { ID: 0, TS: 1, PERIOD: 2, SHIFT: 3, LAST: 4, FIRST: 5, KEY: 6, INLIST: 7, TYPE: 8, QTY: 9,
  PRICE: 10, TOTAL: 11, NOTE: 12, BY: 13, STATUS: 14, VOID_AT: 15, VOID_BY: 16 };

const EXPENSE_HEADERS = ['מזהה', 'זמן רישום', 'חודש', 'תאריך הוצאה', 'פירוט', 'סכום', 'נרשם ע"י', 'סטטוס', 'בוטל בזמן', 'בוטל ע"י'];
const E = { ID: 0, TS: 1, PERIOD: 2, DATE: 3, DESC: 4, AMOUNT: 5, BY: 6, STATUS: 7, VOID_AT: 8, VOID_BY: 9 };

const TYPES_HEADERS = ['שם', 'מחיר', 'פעיל'];

const PERIOD_HEADERS = ['חודש', 'שם', 'התחלה', 'סיום', 'מזהה דוח', 'קישור לדוח', 'סטטוס'];
const P = { KEY: 0, TITLE: 1, START: 2, END: 3, REPORT_ID: 4, REPORT_URL: 5, STATUS: 6 };

const TODO_HEADERS = ['מזהה', 'פריט', 'סטטוס', 'נוצר', 'נוצר ע"י', 'עודכן', 'עודכן ע"י'];
const T = { ID: 0, TEXT: 1, STATUS: 2, CREATED: 3, CREATED_BY: 4, UPDATED: 5, UPDATED_BY: 6 };
const TODO_OPEN = 'חסר';
const TODO_DONE = 'נקנה';
const TODO_DELETED = 'נמחק';

const ACTIVE = 'פעיל';
const VOIDED = 'בוטל';
const OPEN = 'פתוח';
const CLOSED = 'סגור';

const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/* ---------- עזרים ---------- */

function props_() { return PropertiesService.getScriptProperties(); }
function tz_() { return Session.getScriptTimeZone(); }
function fmt_(d, pattern) { return Utilities.formatDate(d, tz_(), pattern); }
function monthKey_(d) { return fmt_(d, 'yyyy-MM'); }

function nextMonthKey_(key) {
  let [y, m] = key.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return y + '-' + String(m).padStart(2, '0');
}

function periodTitle_(key) {
  const [y, m] = key.split('-').map(Number);
  return HEB_MONTHS[m - 1] + ' ' + y;
}

function isLastDayOfMonth_(d) {
  const tomorrow = new Date(d.getTime() + 24 * 3600 * 1000);
  return fmt_(tomorrow, 'MM') !== fmt_(d, 'MM');
}

/** מכירה ב-01:30 שייכת למשמרת של הערב הקודם */
function shiftDate_(d) {
  return fmt_(new Date(d.getTime() - CONFIG.SHIFT_DAY_OFFSET_HOURS * 3600 * 1000), 'yyyy-MM-dd');
}

/** Sheets עלול להמיר "2026-10" לתאריך – מנרמלים בקריאה */
function keyOf_(v) {
  if (v instanceof Date) return fmt_(v, 'yyyy-MM');
  return String(v).replace(/^'/, '').trim();
}
function dayOf_(v) {
  if (v instanceof Date) return fmt_(v, 'yyyy-MM-dd');
  return String(v).replace(/^'/, '').trim();
}

/** מכריח טקסט + מונע הזרקת נוסחאות */
function asText_(s) { return "'" + String(s); }

function cleanText_(s, maxLen) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen || 120);
}

function ss_() {
  const id = props_().getProperty('MASTER_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('הגיליון "' + name + '" חסר. הרץ setup.');
  return sh;
}

function dataRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

function findRowById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const cell = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('המערכת עמוסה כרגע, נסה שוב בעוד רגע');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- סוגי כרטיסיות ---------- */

function getTicketTypes_(includeInactive) {
  return dataRows_(sheet_(SHEETS.TYPES))
    .map(r => ({ name: cleanText_(r[0], 40), price: Number(r[1]), active: r[2] === true || String(r[2]).toUpperCase() === 'TRUE' }))
    .filter(t => t.name && t.price > 0 && (includeInactive || t.active));
}

/* ---------- רשימת חברים ---------- */

function getMembers_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    const hit = cache.get('members');
    if (hit) return JSON.parse(hit);
  }
  const values = readMembersValues_();
  if (!values.length) throw new Error('הלשונית "' + CONFIG.MEMBERS_TAB_NAME + '" ריקה');
  const headers = (values[0] || []).map(h => String(h).trim());
  const iLast = headers.indexOf(CONFIG.MEMBERS_LAST_NAME_HEADER);
  const iFirst = headers.indexOf(CONFIG.MEMBERS_FIRST_NAME_HEADER);
  if (iLast < 0 || iFirst < 0) {
    throw new Error('בלשונית "' + CONFIG.MEMBERS_TAB_NAME + '" לא נמצאו העמודות "' + CONFIG.MEMBERS_LAST_NAME_HEADER +
      '" ו-"' + CONFIG.MEMBERS_FIRST_NAME_HEADER + '" בשורה הראשונה. נמצאו: ' + headers.filter(String).join(', '));
  }
  // נשמרים רק שם פרטי ושם משפחה. שאר העמודות (ת"ז, טלפון, מייל…) לא נשמרות ולא נשלחות לטלפון.
  const seen = {};
  const members = [];
  values.slice(1).forEach(r => {
    if (!r) return;
    const last = cleanText_(r[iLast], 60);
    const first = cleanText_(r[iFirst], 60);
    if (!last && !first) return;
    const key = last + '|' + first;
    if (seen[key]) return;
    seen[key] = true;
    members.push({ key: key, last: last, first: first });
  });
  members.sort((a, b) => (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first, 'he'));
  try { cache.put('members', JSON.stringify(members), 600); } catch (e) { /* רשימה גדולה מדי למטמון – לא נורא */ }
  return members;
}

/** מוציא את מזהה הקובץ מהקישור */
function parseSheetUrl_(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) throw new Error('הקישור לרשימת החברים ב-Config.gs לא תקין – הדבק את הכתובת המלאה מהדפדפן');
  return { id: m[1] };
}

/**
 * קריאה בלבד מקובץ החברים – בלשונית CONFIG.MEMBERS_TAB_NAME.
 * - קובץ Excel (xlsx) ששמור ב-Drive: מורידים עותק של התוכן בזיכרון ומפענחים אותו. המקור לא נפתח לעריכה.
 * - Google Sheet רגיל: קוראים ערכים בלבד.
 * אין בשום מקום בקוד פעולת כתיבה לקובץ החברים.
 */
function readMembersValues_() {
  const ref = parseSheetUrl_(CONFIG.MEMBERS_SHEET_URL);
  let file;
  try {
    file = DriveApp.getFileById(ref.id);
  } catch (e) {
    throw new Error('אין גישה לקובץ רשימת החברים. ודא שהקובץ משותף עם ' +
      Session.getEffectiveUser().getEmail() + ' (מספיקה הרשאת צפייה).');
  }
  const mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) {
    const sh = SpreadsheetApp.openById(ref.id).getSheets()
      .find(s => s.getName().trim() === CONFIG.MEMBERS_TAB_NAME.trim());
    if (!sh) throw new Error('הלשונית "' + CONFIG.MEMBERS_TAB_NAME + '" לא נמצאה בקובץ החברים');
    return sh.getDataRange().getDisplayValues();
  }
  if (/spreadsheetml|ms-excel/.test(mime)) {
    let blob;
    try { blob = file.getBlob(); } catch (e) {
      throw new Error('בעל הקובץ חסם הורדה לצופים, ולכן אי אפשר לקרוא אותו. בקש ממנו לאפשר הורדה, או לשתף איתך את הקובץ כ-Google Sheet.');
    }
    return readXlsxSheet_(blob, CONFIG.MEMBERS_TAB_NAME);
  }
  throw new Error('סוג קובץ לא נתמך לרשימת החברים: ' + mime);
}

/** מפענח לשונית אחת מקובץ xlsx לטבלת מחרוזות (שורה 1 = שורה 0) */
function readXlsxSheet_(blob, tabName) {
  const files = Utilities.unzip(blob.setContentType('application/zip'));
  const byName = {};
  files.forEach(f => { byName[f.getName().replace(/^\//, '')] = f; });
  const parse = name => byName[name] ? XmlService.parse(byName[name].getDataAsString('UTF-8')).getRootElement() : null;

  const ns = XmlService.getNamespace('http://schemas.openxmlformats.org/spreadsheetml/2006/main');
  const rNs = XmlService.getNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
  const relNs = XmlService.getNamespace('http://schemas.openxmlformats.org/package/2006/relationships');

  const wb = parse('xl/workbook.xml');
  if (!wb) throw new Error('קובץ החברים אינו קובץ Excel תקין');
  const sheets = wb.getChild('sheets', ns).getChildren('sheet', ns);
  const target = sheets.find(s => s.getAttribute('name').getValue().trim() === tabName.trim());
  if (!target) {
    throw new Error('הלשונית "' + tabName + '" לא נמצאה. לשוניות בקובץ: ' +
      sheets.map(s => s.getAttribute('name').getValue()).join(', '));
  }
  const rid = target.getAttribute('id', rNs).getValue();
  const rel = parse('xl/_rels/workbook.xml.rels').getChildren('Relationship', relNs)
    .find(r => r.getAttribute('Id').getValue() === rid);
  let path = rel.getAttribute('Target').getValue();
  path = path.charAt(0) === '/' ? path.slice(1) : 'xl/' + path;

  const sst = parse('xl/sharedStrings.xml');
  const shared = sst ? sst.getChildren('si', ns).map(si => xlsxText_(si, ns)) : [];

  const sheetData = parse(path).getChild('sheetData', ns);
  const out = [];
  let rowSeq = 0;
  sheetData.getChildren('row', ns).forEach(row => {
    const rAttr = row.getAttribute('r');
    const rIdx = rAttr ? Number(rAttr.getValue()) - 1 : rowSeq;
    rowSeq = rIdx + 1;
    const arr = [];
    let colSeq = 0;
    row.getChildren('c', ns).forEach(c => {
      const ref = c.getAttribute('r');
      const col = ref ? xlsxCol_(ref.getValue()) : colSeq;
      colSeq = col + 1;
      const tAttr = c.getAttribute('t');
      const t = tAttr ? tAttr.getValue() : '';
      let v = '';
      if (t === 'inlineStr') {
        const is = c.getChild('is', ns);
        v = is ? xlsxText_(is, ns) : '';
      } else {
        const ve = c.getChild('v', ns);
        v = ve ? ve.getText() : '';
        if (t === 's') v = shared[Number(v)] || '';
      }
      arr[col] = v;
    });
    out[rIdx] = arr;
  });
  for (let i = 0; i < out.length; i++) {
    out[i] = out[i] || [];
    for (let j = 0; j < out[i].length; j++) if (out[i][j] === undefined) out[i][j] = '';
  }
  return out;
}

function xlsxText_(el, ns) {
  let s = '';
  const t = el.getChild('t', ns);
  if (t) s += t.getText();
  el.getChildren('r', ns).forEach(r => { const rt = r.getChild('t', ns); if (rt) s += rt.getText(); });
  return s;
}

function xlsxCol_(ref) {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

/** בודק איזו הרשאה יש לנו על קובץ החברים – לדיווח בהתקנה */
function membersAccessLevel_() {
  try {
    const f = DriveApp.getFileById(parseSheetUrl_(CONFIG.MEMBERS_SHEET_URL).id);
    return String(f.getAccess(Session.getEffectiveUser()));
  } catch (e) {
    return 'UNKNOWN';
  }
}

/* ---------- תקופות (חודשי דיווח) ---------- */

function getOpenPeriod_() {
  const sh = sheet_(SHEETS.PERIODS);
  const rows = dataRows_(sh);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][P.STATUS] === OPEN) return periodFromRow_(rows[i], i + 2);
  }
  return null;
}

function getPeriodByKey_(key) {
  const rows = dataRows_(sheet_(SHEETS.PERIODS));
  for (let i = rows.length - 1; i >= 0; i--) {
    if (keyOf_(rows[i][P.KEY]) === key) return periodFromRow_(rows[i], i + 2);
  }
  return null;
}

function periodFromRow_(r, row) {
  return {
    row: row,
    key: keyOf_(r[P.KEY]),
    title: periodTitle_(keyOf_(r[P.KEY])), // תמיד מחושב מהמפתח – Sheets הופך "אוקטובר 2026" לתאריך
    start: r[P.START] instanceof Date ? r[P.START] : new Date(r[P.START]),
    end: r[P.END] instanceof Date ? r[P.END] : null,
    reportId: String(r[P.REPORT_ID] || ''),
    reportUrl: String(r[P.REPORT_URL] || ''),
    status: r[P.STATUS],
  };
}

/** קובע אם צריך לסגור את החודש הפתוח */
function shouldClose_(p, now) {
  const thisKey = monthKey_(now);
  if (p.key < thisKey) return true; // פספסנו סגירה (למשל טריגר שנכשל) – סוגרים עכשיו
  return p.key === thisKey && isLastDayOfMonth_(now) && Number(fmt_(now, 'H')) >= CONFIG.CLOSE_HOUR;
}
