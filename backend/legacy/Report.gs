/**
 * הדוח החודשי: קובץ חדש לכל חודש עם שלוש לשוניות – הכנסות, הוצאות, סיכום.
 */

const COLORS = {
  header: '#1e4d3a', headerText: '#ffffff',
  band: '#f3f8f5', total: '#d9ead3',
  income: '#b7e1cd', expense: '#f4c7c3', border: '#9aa5a0',
};
const CURRENCY = '₪#,##0;-₪#,##0';

function buildReport_(p, final) {
  let book = null;
  if (p.reportId) {
    try { book = SpreadsheetApp.openById(p.reportId); } catch (e) { book = null; }
  }
  if (!book) book = createReportFile_(p);
  const expectedName = CONFIG.PUB_NAME + ' - ' + p.title;
  if (book.getName() !== expectedName) book.rename(expectedName);

  const sales = dataRows_(sheet_(SHEETS.SALES))
    .filter(r => keyOf_(r[S.PERIOD]) === p.key && r[S.STATUS] !== VOIDED);
  const expenses = dataRows_(sheet_(SHEETS.EXPENSES))
    .filter(r => keyOf_(r[E.PERIOD]) === p.key && r[E.STATUS] !== VOIDED);

  const income = writeIncomeTab_(book.getSheetByName('הכנסות'), sales);
  const exp = writeExpensesTab_(book.getSheetByName('הוצאות'), expenses);
  writeSummaryTab_(book.getSheetByName('סיכום'), p, sales, income, exp, final);
  SpreadsheetApp.flush();
  return { book: book, ticketCount: income.ticketCount, incomeTotal: income.amount, expenseTotal: exp.amount };
}

function createReportFile_(p) {
  const book = SpreadsheetApp.create(CONFIG.PUB_NAME + ' - ' + p.title);
  book.setSpreadsheetTimeZone(tz_());
  const folderId = props_().getProperty('REPORTS_FOLDER_ID');
  if (folderId) DriveApp.getFileById(book.getId()).moveTo(DriveApp.getFolderById(folderId));

  const first = book.getSheets()[0];
  first.setName('הכנסות');
  book.insertSheet('הוצאות', 1);
  book.insertSheet('סיכום', 2);
  book.getSheets().forEach(sh => sh.setRightToLeft(true));

  const psh = sheet_(SHEETS.PERIODS);
  psh.getRange(p.row, P.REPORT_ID + 1, 1, 2).setValues([[book.getId(), book.getUrl()]]);
  return book;
}

function resetSheet_(sh) {
  sh.getBandings().forEach(b => b.remove());
  const f = sh.getFilter();
  if (f) f.remove();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.setConditionalFormatRules([]);
  sh.clear();
  sh.setRightToLeft(true);
}

function styleHeader_(range) {
  range.setFontWeight('bold').setBackground(COLORS.header).setFontColor(COLORS.headerText)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
}

function styleTotal_(range) {
  range.setFontWeight('bold').setBackground(COLORS.total)
    .setBorder(true, null, null, null, null, null, COLORS.border, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/* ---------- הכנסות ---------- */

function writeIncomeTab_(sh, sales) {
  resetSheet_(sh);

  // עמודה לכל סוג+מחיר שהופיע בחודש (אם יש יותר מאחד)
  const typeMap = {};
  sales.forEach(r => {
    const t = keyOf_(r[S.TYPE]), pr = Number(r[S.PRICE]);
    typeMap[t + '|' + pr] = { name: t, price: pr };
  });
  const types = Object.keys(typeMap).map(k => Object.assign({ k: k }, typeMap[k])).sort((a, b) => a.price - b.price);
  const multi = types.length > 1;

  const people = {};
  sales.forEach(r => {
    const key = keyOf_(r[S.KEY]);
    const p = people[key] || (people[key] = {
      last: keyOf_(r[S.LAST]), first: keyOf_(r[S.FIRST]), inList: r[S.INLIST] === 'כן',
      byType: {}, qty: 0, amount: 0, notes: [],
    });
    const tk = keyOf_(r[S.TYPE]) + '|' + Number(r[S.PRICE]);
    p.byType[tk] = (p.byType[tk] || 0) + Number(r[S.QTY]);
    p.qty += Number(r[S.QTY]);
    p.amount += Number(r[S.TOTAL]);
    const note = keyOf_(r[S.NOTE]);
    if (note && p.notes.indexOf(note) < 0) p.notes.push(note);
  });

  const list = Object.keys(people).map(k => people[k])
    .sort((a, b) => (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first, 'he'));

  const headers = ['שם משפחה', 'שם פרטי']
    .concat(multi ? types.map(t => t.name + ' (₪' + t.price + ')') : [])
    .concat([multi ? 'סה"כ כרטיסיות' : 'מספר כרטיסיות', 'סה"כ', 'הערות']);
  const nCols = headers.length;
  const qtyCol = nCols - 2;   // 1-based index of total qty column
  const amountCol = nCols - 1;

  const rows = list.map(p => {
    const notes = p.notes.slice();
    if (!p.inList) notes.unshift('לא ברשימה');
    return [p.last, p.first]
      .concat(multi ? types.map(t => p.byType[t.k] || 0) : [])
      .concat([p.qty, p.amount, notes.join(' · ')]);
  });

  sh.getRange(1, 1, 1, nCols).setValues([headers]);
  styleHeader_(sh.getRange(1, 1, 1, nCols));
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

  // שורת סה"כ – נוסחאות, כדי שתיקון ידני בדוח יתעדכן אוטומטית
  const totals = new Array(nCols).fill('');
  totals[0] = 'סה"כ';
  totals[1] = rows.length + ' רוכשים';
  for (let c = 3; c <= amountCol; c++) {
    const col = columnLetter_(c);
    totals[c - 1] = rows.length ? '=SUM(' + col + '2:' + col + (totalRow - 1) + ')' : 0;
  }
  sh.getRange(totalRow, 1, 1, nCols).setValues([totals]);
  styleTotal_(sh.getRange(totalRow, 1, 1, nCols));

  sh.getRange(2, amountCol, rows.length + 1, 1).setNumberFormat(CURRENCY);
  sh.getRange(2, 3, rows.length + 1, amountCol - 2).setHorizontalAlignment('center');
  sh.getRange(1, 1, totalRow, nCols).setBorder(true, true, true, true, true, true, '#d0d7d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, 2, 120);
  sh.setColumnWidths(3, nCols - 3, 105);
  sh.setColumnWidth(nCols, 260);

  const ticketCount = rows.reduce((s, r) => s + Number(r[qtyCol - 1]), 0);
  const amount = rows.reduce((s, r) => s + Number(r[amountCol - 1]), 0);
  return {
    totalRow: totalRow, qtyCell: columnLetter_(qtyCol) + totalRow, amountCell: columnLetter_(amountCol) + totalRow,
    ticketCount: ticketCount, amount: amount, buyers: rows.length, types: types, multi: multi, sales: sales,
  };
}

/* ---------- הוצאות ---------- */

function writeExpensesTab_(sh, expenses) {
  resetSheet_(sh);
  const rows = expenses
    .map(r => [r[E.DATE], keyOf_(r[E.DESC]), Number(r[E.AMOUNT])])
    .sort((a, b) => new Date(a[0]) - new Date(b[0]));

  sh.getRange(1, 1, 1, 3).setValues([['תאריך', 'פירוט', 'סכום']]);
  styleHeader_(sh.getRange(1, 1, 1, 3));
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
  styleTotal_(sh.getRange(totalRow, 1, 1, 3));

  sh.getRange(2, 1, Math.max(rows.length, 1), 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  sh.getRange(2, 3, rows.length + 1, 1).setNumberFormat(CURRENCY);
  sh.getRange(1, 1, totalRow, 3).setBorder(true, true, true, true, true, true, '#d0d7d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 280);
  sh.setColumnWidth(3, 110);

  return { totalRow: totalRow, amountCell: 'C' + totalRow, amount: rows.reduce((s, r) => s + r[2], 0), count: rows.length };
}

/* ---------- סיכום ---------- */

function writeSummaryTab_(sh, p, sales, income, exp, final) {
  resetSheet_(sh);
  const inc = "'הכנסות'!", ex = "'הוצאות'!";

  sh.getRange('A1:C1').setValues([['', 'כרטיסיות', 'סה"כ']]);
  styleHeader_(sh.getRange('A1:C1'));
  sh.getRange('A2:C4').setValues([
    ['הכנסות', '=' + inc + income.qtyCell, '=' + inc + income.amountCell],
    ['הוצאות', '—', '=' + ex + exp.amountCell],
    ['רווח נקי', '', '=C2-C3'],
  ]);
  sh.getRange('A2:A4').setFontWeight('bold');
  sh.getRange('B2:C4').setHorizontalAlignment('center');
  sh.getRange('C2:C4').setNumberFormat(CURRENCY);
  sh.getRange('C2').setBackground(COLORS.income);
  sh.getRange('C3').setBackground(COLORS.expense);
  styleTotal_(sh.getRange('A4:C4'));
  sh.getRange('A1:C4').setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  // רווח שלילי באדום
  const rule = SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
    .setFontColor('#c0392b').setRanges([sh.getRange('C4')]).build();
  sh.setConditionalFormatRules([rule]);

  // פירוט לפי סוג כרטיסייה (כשיש יותר מסוג אחד)
  let row = 6;
  if (income.multi) {
    sh.getRange(row, 1, 1, 3).setValues([['סוג כרטיסייה', 'כמות', 'סכום']]);
    styleHeader_(sh.getRange(row, 1, 1, 3));
    const lines = income.types.map(t => {
      let q = 0;
      sales.forEach(r => { if (keyOf_(r[S.TYPE]) + '|' + Number(r[S.PRICE]) === t.k) q += Number(r[S.QTY]); });
      return [t.name + ' (₪' + t.price + ')', q, q * t.price];
    });
    sh.getRange(row + 1, 1, lines.length, 3).setValues(lines);
    sh.getRange(row + 1, 3, lines.length, 1).setNumberFormat(CURRENCY);
    sh.getRange(row + 1, 2, lines.length, 2).setHorizontalAlignment('center');
    sh.getRange(row, 1, lines.length + 1, 3).setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
    row += lines.length + 2;
  }

  // פרטי התקופה
  const shifts = {};
  sales.forEach(r => { shifts[dayOf_(r[S.SHIFT])] = true; });
  const now = new Date();
  const info = [
    ['תקופה', fmt_(p.start, 'dd/MM/yyyy HH:mm') + ' – ' + (final ? fmt_(now, 'dd/MM/yyyy HH:mm') : 'עכשיו'), ''],
    ['מספר משמרות', Object.keys(shifts).length, ''],
    ['מספר רוכשים', income.buyers, ''],
    ['מספר הוצאות', exp.count, ''],
    ['סטטוס', final ? 'סופי ✔' : 'טיוטה – מתעדכן כל בוקר', ''],
    ['עודכן לאחרונה', fmt_(now, 'dd/MM/yyyy HH:mm'), ''],
  ];
  sh.getRange(row, 1, info.length, 3).setValues(info);
  sh.getRange(row, 1, info.length, 1).setFontWeight('bold').setFontColor('#555555');
  for (let i = 0; i < info.length; i++) sh.getRange(row + i, 2, 1, 2).merge().setHorizontalAlignment('right');
  sh.getRange(row + 4, 2).setFontColor(final ? '#1e7b45' : '#b26a00').setFontWeight('bold');

  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 120);
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ---------- נעילה ושליחה ---------- */

function lockReport_(book) {
  book.getSheets().forEach(sh => {
    const prot = sh.protect().setDescription('דוח סגור – נוצר אוטומטית');
    prot.getEditors().forEach(u => { try { prot.removeEditor(u); } catch (e) { /* הבעלים נשאר תמיד */ } });
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  });
}

function emailReport_(p, result) {
  const url = result.book.getUrl();
  const net = result.incomeTotal - result.expenseTotal;
  const money = n => '₪' + Math.round(n).toLocaleString('en-US');
  const html =
    '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#222">' +
    '<h2 style="color:#1e4d3a;margin:0 0 12px">' + CONFIG.PUB_NAME + ' – דוח ' + p.title + '</h2>' +
    '<table cellpadding="8" style="border-collapse:collapse;border:1px solid #ccc">' +
    '<tr style="background:#1e4d3a;color:#fff"><th></th><th>כרטיסיות</th><th>סה"כ</th></tr>' +
    '<tr><td><b>הכנסות</b></td><td align="center">' + result.ticketCount + '</td><td style="background:#b7e1cd">' + money(result.incomeTotal) + '</td></tr>' +
    '<tr><td><b>הוצאות</b></td><td align="center">—</td><td style="background:#f4c7c3">' + money(result.expenseTotal) + '</td></tr>' +
    '<tr style="background:#d9ead3"><td><b>רווח נקי</b></td><td></td><td><b>' + money(net) + '</b></td></tr>' +
    '</table>' +
    '<p>תקופה: ' + fmt_(p.start, 'dd/MM/yyyy HH:mm') + ' – ' + fmt_(new Date(), 'dd/MM/yyyy HH:mm') + '</p>' +
    '<p><a href="' + url + '" style="background:#1e4d3a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">פתח את הדוח המלא</a></p>' +
    '<p style="color:#888;font-size:12px">מצורף PDF. נשלח אוטומטית ממערכת הקופה.</p></div>';

  const options = { name: CONFIG.PUB_NAME, htmlBody: html };
  try {
    options.attachments = [DriveApp.getFileById(result.book.getId()).getAs(MimeType.PDF)
      .setName(CONFIG.PUB_NAME + ' - ' + p.title + '.pdf')];
  } catch (e) { console.warn('PDF failed: ' + e); }
  MailApp.sendEmail(CONFIG.ADMIN_EMAIL, CONFIG.PUB_NAME + ' – דוח חודשי ' + p.title, 'דוח ' + p.title + ': ' + url, options);
}
