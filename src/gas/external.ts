/**
 * Read-only access to the external member list (Google Sheet or xlsx in Drive).
 * There is no write to this file anywhere in the code.
 */
import type { SyncCandidate } from '../shared/api';
import { AppError } from '../core/errors';
import { parseExternalTable } from '../core/members';
import { getProp, PROP } from './config';
import { cache, heCompare } from './util';

export function externalHeaders() {
  return {
    tab: getProp(PROP.MEMBERS_TAB_NAME) || 'עדכני',
    last: getProp(PROP.MEMBERS_LAST_HEADER) || 'שם משפחה',
    first: getProp(PROP.MEMBERS_FIRST_HEADER) || 'שם פרטי',
  };
}

/** Parsed external list, cached 10 minutes (same as legacy). */
export function readExternalMembers(forceRefresh: boolean): SyncCandidate[] {
  const c = cache();
  if (!forceRefresh) {
    const hit = c.get('extmembers');
    if (hit) return JSON.parse(hit) as SyncCandidate[];
  }
  const list = parseExternalTable(readValues(), externalHeaders(), heCompare);
  try { c.put('extmembers', JSON.stringify(list), 600); } catch { /* too big for cache – fine */ }
  return list;
}

function readValues(): string[][] {
  const id = getProp(PROP.MEMBERS_FILE_ID);
  if (!id) throw new AppError('NOT_CONFIGURED', 'קובץ רשימת החברים לא הוגדר');
  const tab = externalHeaders().tab;
  let file: GoogleAppsScript.Drive.File;
  try {
    file = DriveApp.getFileById(id);
  } catch {
    throw new AppError('NOT_CONFIGURED', 'אין גישה לקובץ רשימת החברים. ודא שהקובץ משותף עם ' +
      Session.getEffectiveUser().getEmail() + ' (מספיקה הרשאת צפייה).');
  }
  const mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) {
    const sh = SpreadsheetApp.openById(id).getSheets().find(s => s.getName().trim() === tab.trim());
    if (!sh) throw new AppError('NOT_CONFIGURED', 'הלשונית "' + tab + '" לא נמצאה בקובץ החברים');
    return sh.getDataRange().getDisplayValues();
  }
  if (/spreadsheetml|ms-excel/.test(mime)) {
    let blob: GoogleAppsScript.Base.Blob;
    try { blob = file.getBlob(); } catch {
      throw new AppError('NOT_CONFIGURED', 'בעל הקובץ חסם הורדה לצופים, ולכן אי אפשר לקרוא אותו. בקש ממנו לאפשר הורדה, או לשתף את הקובץ כ-Google Sheet.');
    }
    return readXlsxSheet(blob, tab);
  }
  throw new AppError('NOT_CONFIGURED', 'סוג קובץ לא נתמך לרשימת החברים: ' + mime);
}

/** Decodes one tab of an xlsx file into a string table (port of legacy readXlsxSheet_). */
function readXlsxSheet(blob: GoogleAppsScript.Base.Blob, tabName: string): string[][] {
  blob.setContentType('application/zip');
  const files = Utilities.unzip(blob);
  const byName: Record<string, GoogleAppsScript.Base.Blob> = {};
  files.forEach(f => { byName[(f.getName() || '').replace(/^\//, '')] = f; });
  const parse = (name: string) => byName[name] ? XmlService.parse(byName[name].getDataAsString('UTF-8')).getRootElement() : null;

  const ns = XmlService.getNamespace('http://schemas.openxmlformats.org/spreadsheetml/2006/main');
  const rNs = XmlService.getNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
  const relNs = XmlService.getNamespace('http://schemas.openxmlformats.org/package/2006/relationships');

  const wb = parse('xl/workbook.xml');
  if (!wb) throw new AppError('NOT_CONFIGURED', 'קובץ החברים אינו קובץ Excel תקין');
  const sheetsEl = wb.getChild('sheets', ns);
  if (!sheetsEl) throw new AppError('NOT_CONFIGURED', 'קובץ החברים אינו קובץ Excel תקין');
  const sheets = sheetsEl.getChildren('sheet', ns);
  const target = sheets.find(s => s.getAttribute('name').getValue().trim() === tabName.trim());
  if (!target) {
    throw new AppError('NOT_CONFIGURED', 'הלשונית "' + tabName + '" לא נמצאה. לשוניות בקובץ: ' +
      sheets.map(s => s.getAttribute('name').getValue()).join(', '));
  }
  const rid = target.getAttribute('id', rNs).getValue();
  const rels = parse('xl/_rels/workbook.xml.rels');
  const rel = rels ? rels.getChildren('Relationship', relNs).find(r => r.getAttribute('Id').getValue() === rid) : null;
  if (!rel) throw new AppError('NOT_CONFIGURED', 'קובץ החברים פגום (relationships)');
  let path = rel.getAttribute('Target').getValue();
  path = path.charAt(0) === '/' ? path.slice(1) : 'xl/' + path;

  const sst = parse('xl/sharedStrings.xml');
  const shared = sst ? sst.getChildren('si', ns).map(si => xlsxText(si, ns)) : [];

  const sheetRoot = parse(path);
  if (!sheetRoot) throw new AppError('NOT_CONFIGURED', 'קובץ החברים פגום (sheet)');
  const sheetData = sheetRoot.getChild('sheetData', ns);
  const out: string[][] = [];
  let rowSeq = 0;
  sheetData.getChildren('row', ns).forEach(row => {
    const rAttr = row.getAttribute('r');
    const rIdx = rAttr ? Number(rAttr.getValue()) - 1 : rowSeq;
    rowSeq = rIdx + 1;
    const arr: string[] = [];
    let colSeq = 0;
    row.getChildren('c', ns).forEach(c => {
      const ref = c.getAttribute('r');
      const col = ref ? xlsxCol(ref.getValue()) : colSeq;
      colSeq = col + 1;
      const tAttr = c.getAttribute('t');
      const t = tAttr ? tAttr.getValue() : '';
      let v = '';
      if (t === 'inlineStr') {
        const is = c.getChild('is', ns);
        v = is ? xlsxText(is, ns) : '';
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

function xlsxText(el: GoogleAppsScript.XML_Service.Element, ns: GoogleAppsScript.XML_Service.Namespace): string {
  let s = '';
  const t = el.getChild('t', ns);
  if (t) s += t.getText();
  el.getChildren('r', ns).forEach(r => { const rt = r.getChild('t', ns); if (rt) s += rt.getText(); });
  return s;
}

function xlsxCol(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
