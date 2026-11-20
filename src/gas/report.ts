/**
 * Monthly report spreadsheet (port of legacy Report.gs). Numbers come from core/report.ts.
 */
import { toAgorot, toShekels } from '../shared/money';
import { buildExpenses, buildIncome, netProfit, type ExpensesSection, type Income, type ReportExpense, type ReportSale } from '../core/report';
import { fromText } from '../core/text';
import { getProp, mailPrefix, PROP, PUB_NAME } from './config';
import type { PeriodRow } from './periods';
import { COLORS, dataRows, sheet } from './sheets';
import { E, EXPENSE_HEADERS, P, S, SALES_HEADERS, SHEETS, VOIDED } from './schema';
import { dayOf, fmt, heCompare, keyOf, tz } from './util';

const CURRENCY = '₪#,##0;-₪#,##0';

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
type Book = GoogleAppsScript.Spreadsheet.Spreadsheet;

export interface ReportResult { book: Book; income: Income; exp: ExpensesSection }

export function reportSales(periodKey: string): ReportSale[] {
  return dataRows(sheet(SHEETS.SALES), SALES_HEADERS.length)
    .filter(r => keyOf(r[S.PERIOD]) === periodKey && r[S.STATUS] !== VOIDED)
    .map(r => ({
      memberRef: fromText(r[S.KEY]), // stage 1: the legacy name key
      last: fromText(r[S.LAST]),
      first: fromText(r[S.FIRST]),
      inList: r[S.INLIST] === 'כן',
      cardType: fromText(r[S.TYPE]),
      unitPriceAgorot: toAgorot(r[S.PRICE] as number),
      qty: Number(r[S.QTY]),
      totalAgorot: toAgorot(r[S.TOTAL] as number),
      note: fromText(r[S.NOTE]),
      shiftDate: dayOf(r[S.SHIFT]),
    }));
}

export function reportExpenses(periodKey: string): ReportExpense[] {
  return dataRows(sheet(SHEETS.EXPENSES), EXPENSE_HEADERS.length)
    .filter(r => keyOf(r[E.PERIOD]) === periodKey && r[E.STATUS] !== VOIDED)
    .map(r => ({ date: r[E.DATE] as Date, desc: fromText(r[E.DESC]), amountAgorot: toAgorot(r[E.AMOUNT] as number), type: 'EXPENSE' as const }));
}

export function buildReport(p: PeriodRow, final: boolean): ReportResult {
  let book: Book | null = null;
  if (p.reportId) {
    try { book = SpreadsheetApp.openById(p.reportId); } catch { book = null; }
  }
  if (!book) book = createReportFile(p);
  const expectedName = PUB_NAME + ' - ' + p.title;
  if (book.getName() !== expectedName) book.rename(expectedName);

  const income = buildIncome(reportSales(p.key), heCompare);
  const exp = buildExpenses(reportExpenses(p.key));

  const incomeCells = writeIncomeTab(tab(book, 'הכנסות', 0), income);
  const expCells = writeExpensesTab(tab(book, 'הוצאות', 1), exp);
  writeSummaryTab(tab(book, 'סיכום', 2), p, income, exp, incomeCells, expCells, final);
  SpreadsheetApp.flush();
  return { book, income, exp };
}

function tab(book: Book, name: string, index: number): Sheet {
  return book.getSheetByName(name) || book.insertSheet(name, index);
}

function createReportFile(p: PeriodRow): Book {
  const book = SpreadsheetApp.create(PUB_NAME + ' - ' + p.title);
  book.setSpreadsheetTimeZone(tz());
  const folderId = getProp(PROP.REPORTS_FOLDER_ID);
  if (folderId) DriveApp.getFileById(book.getId()).moveTo(DriveApp.getFolderById(folderId));
  const first = book.getSheets()[0];
  first.setName('הכנסות');
  book.insertSheet('הוצאות', 1);
  book.insertSheet('סיכום', 2);
  book.getSheets().forEach(sh => sh.setRightToLeft(true));
  sheet(SHEETS.PERIODS).getRange(p.row, P.REPORT_ID + 1, 1, 2).setValues([[book.getId(), book.getUrl()]]);
  return book;
}

function resetSheet(sh: Sheet): void {
  sh.getBandings().forEach(b => b.remove());
  const f = sh.getFilter();
  if (f) f.remove();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.setConditionalFormatRules([]);
  sh.clear();
  sh.setRightToLeft(true);
}

function styleHeader(range: GoogleAppsScript.Spreadsheet.Range): void {
  range.setFontWeight('bold').setBackground(COLORS.header).setFontColor(COLORS.headerText)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
}

function styleTotal(range: GoogleAppsScript.Spreadsheet.Range): void {
  range.setFontWeight('bold').setBackground(COLORS.total)
    .setBorder(true, null, null, null, null, null, COLORS.border, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

export function columnLetter(n: number): string {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ---------- income ---------- */

function writeIncomeTab(sh: Sheet, inc: Income): { qtyCell: string; amountCell: string } {
  resetSheet(sh);
  const headers = ['שם משפחה', 'שם פרטי']
    .concat(inc.multi ? inc.types.map(t => t.name + ' (₪' + toShekels(t.priceAgorot) + ')') : [])
    .concat([inc.multi ? 'סה"כ כרטיסיות' : 'מספר כרטיסיות', 'סה"כ', 'הערות']);
  const nCols = headers.length;
  const qtyCol = nCols - 2;
  const amountCol = nCols - 1;

  const rows: (string | number)[][] = inc.rows.map(r =>
    [r.last, r.first, ...(inc.multi ? r.byType : []), r.qty, toShekels(r.amountAgorot), r.notes]);

  sh.getRange(1, 1, 1, nCols).setValues([headers]);
  styleHeader(sh.getRange(1, 1, 1, nCols));
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);

  const totalRow = rows.length + 2;
  if (rows.length) {
    sh.getRange(2, 1, rows.length, nCols).setValues(rows);
    sh.getRange(1, 1, rows.length + 1, nCols).createFilter();
    sh.getRange(2, 1, rows.length, nCols)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#ffffff').setSecondRowColor(COLORS.band);
  }

  // total row uses formulas, so a manual fix in the report updates automatically
  const totals: (string | number)[] = new Array(nCols).fill('');
  totals[0] = 'סה"כ';
  totals[1] = rows.length + ' רוכשים';
  for (let c = 3; c <= amountCol; c++) {
    const col = columnLetter(c);
    totals[c - 1] = rows.length ? '=SUM(' + col + '2:' + col + (totalRow - 1) + ')' : 0;
  }
  sh.getRange(totalRow, 1, 1, nCols).setValues([totals]);
  styleTotal(sh.getRange(totalRow, 1, 1, nCols));

  sh.getRange(2, amountCol, rows.length + 1, 1).setNumberFormat(CURRENCY);
  sh.getRange(2, 3, rows.length + 1, amountCol - 2).setHorizontalAlignment('center');
  sh.getRange(1, 1, totalRow, nCols).setBorder(true, true, true, true, true, true, '#d0d7d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, 2, 120);
  if (nCols > 3) sh.setColumnWidths(3, nCols - 3, 105);
  sh.setColumnWidth(nCols, 260);
  return { qtyCell: columnLetter(qtyCol) + totalRow, amountCell: columnLetter(amountCol) + totalRow };
}

/* ---------- expenses ---------- */

function writeExpensesTab(sh: Sheet, exp: ExpensesSection): { amountCell: string } {
  resetSheet(sh);
  const rows = exp.rows.map(r => [r.date, r.desc, toShekels(r.amountAgorot)]);
  sh.getRange(1, 1, 1, 3).setValues([['תאריך', 'פירוט', 'סכום']]);
  styleHeader(sh.getRange(1, 1, 1, 3));
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);

  const totalRow = rows.length + 2;
  if (rows.length) {
    sh.getRange(2, 1, rows.length, 3).setValues(rows);
    sh.getRange(2, 1, rows.length, 3)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#ffffff').setSecondRowColor(COLORS.band);
  }
  sh.getRange(totalRow, 1, 1, 3).setValues([['', 'סה"כ', rows.length ? '=SUM(C2:C' + (totalRow - 1) + ')' : 0]]);
  styleTotal(sh.getRange(totalRow, 1, 1, 3));

  sh.getRange(2, 1, Math.max(rows.length, 1), 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  sh.getRange(2, 3, rows.length + 1, 1).setNumberFormat(CURRENCY);
  sh.getRange(1, 1, totalRow, 3).setBorder(true, true, true, true, true, true, '#d0d7d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 280);
  sh.setColumnWidth(3, 110);
  return { amountCell: 'C' + totalRow };
}

/* ---------- summary ---------- */

function writeSummaryTab(sh: Sheet, p: PeriodRow, inc: Income, exp: ExpensesSection,
  incCells: { qtyCell: string; amountCell: string }, expCells: { amountCell: string }, final: boolean): void {
  resetSheet(sh);
  const i = "'הכנסות'!", x = "'הוצאות'!";
  sh.getRange('A1:C1').setValues([['', 'כרטיסיות', 'סה"כ']]);
  styleHeader(sh.getRange('A1:C1'));
  sh.getRange('A2:C4').setValues([
    ['הכנסות', '=' + i + incCells.qtyCell, '=' + i + incCells.amountCell],
    ['הוצאות', '—', '=' + x + expCells.amountCell],
    ['רווח נקי', '', '=C2-C3'],
  ]);
  sh.getRange('A2:A4').setFontWeight('bold');
  sh.getRange('B2:C4').setHorizontalAlignment('center');
  sh.getRange('C2:C4').setNumberFormat(CURRENCY);
  sh.getRange('C2').setBackground(COLORS.income);
  sh.getRange('C3').setBackground(COLORS.expense);
  styleTotal(sh.getRange('A4:C4'));
  sh.getRange('A1:C4').setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
    .setFontColor('#c0392b').setRanges([sh.getRange('C4')]).build()]);

  let row = 6;
  if (inc.multi) {
    sh.getRange(row, 1, 1, 3).setValues([['סוג כרטיסייה', 'כמות', 'סכום']]);
    styleHeader(sh.getRange(row, 1, 1, 3));
    const lines = inc.perType.map(t => [t.label, t.qty, toShekels(t.amountAgorot)]);
    sh.getRange(row + 1, 1, lines.length, 3).setValues(lines);
    sh.getRange(row + 1, 3, lines.length, 1).setNumberFormat(CURRENCY);
    sh.getRange(row + 1, 2, lines.length, 2).setHorizontalAlignment('center');
    sh.getRange(row, 1, lines.length + 1, 3).setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
    row += lines.length + 2;
  }

  const now = new Date();
  const info: (string | number)[][] = [
    ['תקופה', fmt(p.start, 'dd/MM/yyyy HH:mm') + ' – ' + (final ? fmt(now, 'dd/MM/yyyy HH:mm') : 'עכשיו'), ''],
    ['מספר משמרות', inc.shifts, ''],
    ['מספר רוכשים', inc.buyers, ''],
    ['מספר הוצאות', exp.count, ''],
    ['סטטוס', final ? 'סופי ✔' : 'טיוטה – מתעדכן כל בוקר', ''],
    ['עודכן לאחרונה', fmt(now, 'dd/MM/yyyy HH:mm'), ''],
  ];
  sh.getRange(row, 1, info.length, 3).setValues(info);
  sh.getRange(row, 1, info.length, 1).setFontWeight('bold').setFontColor('#555555');
  for (let k = 0; k < info.length; k++) sh.getRange(row + k, 2, 1, 2).merge().setHorizontalAlignment('right');
  sh.getRange(row + 4, 2).setFontColor(final ? '#1e7b45' : '#b26a00').setFontWeight('bold');
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 120);
}

/* ---------- lock & mail ---------- */

export function lockReport(book: Book): void {
  book.getSheets().forEach(sh => {
    const prot = sh.protect().setDescription('דוח סגור – נוצר אוטומטית');
    prot.getEditors().forEach(u => { try { prot.removeEditor(u); } catch { /* owner always stays */ } });
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  });
}

export function emailReport(p: PeriodRow, r: ReportResult): void {
  const to = getProp(PROP.ADMIN_EMAIL);
  if (!to) return;
  const url = r.book.getUrl();
  const money = (a: number) => '₪' + Math.round(a / 100).toLocaleString('en-US');
  const net = netProfit(r.income, r.exp);
  const html =
    '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#222">' +
    '<h2 style="color:#1e4d3a;margin:0 0 12px">' + PUB_NAME + ' – דוח ' + p.title + '</h2>' +
    '<table cellpadding="8" style="border-collapse:collapse;border:1px solid #ccc">' +
    '<tr style="background:#1e4d3a;color:#fff"><th></th><th>כרטיסיות</th><th>סה"כ</th></tr>' +
    '<tr><td><b>הכנסות</b></td><td align="center">' + r.income.cardCount + '</td><td style="background:#b7e1cd">' + money(r.income.amountAgorot) + '</td></tr>' +
    '<tr><td><b>הוצאות</b></td><td align="center">—</td><td style="background:#f4c7c3">' + money(r.exp.netAgorot) + '</td></tr>' +
    '<tr style="background:#d9ead3"><td><b>רווח נקי</b></td><td></td><td><b>' + money(net) + '</b></td></tr>' +
    '</table>' +
    '<p>תקופה: ' + fmt(p.start, 'dd/MM/yyyy HH:mm') + ' – ' + fmt(new Date(), 'dd/MM/yyyy HH:mm') + '</p>' +
    '<p><a href="' + url + '" style="background:#1e4d3a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">פתח את הדוח המלא</a></p>' +
    '<p style="color:#888;font-size:12px">מצורף PDF. נשלח אוטומטית ממערכת הקופה.</p></div>';
  const options: GoogleAppsScript.Mail.MailAdvancedParameters = { name: PUB_NAME, htmlBody: html };
  try {
    options.attachments = [DriveApp.getFileById(r.book.getId()).getAs(MimeType.PDF).setName(PUB_NAME + ' - ' + p.title + '.pdf')];
  } catch (e) { console.warn('PDF failed: ' + e); }
  MailApp.sendEmail(to, mailPrefix() + PUB_NAME + ' – דוח חודשי ' + p.title, 'דוח ' + p.title + ': ' + url, options);
}
