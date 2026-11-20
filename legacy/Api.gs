/**
 * Web App: הדף והפונקציות שהאפליקציה בטלפון קוראת להן.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('הסליק – קופה')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
}

/* ---------- הרשאות ---------- */

function auth_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinFails') || 0);
  if (fails >= 15) throw new Error('יותר מדי ניסיונות שגויים. נסה שוב בעוד 10 דקות');

  let email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { /* לא זמין */ }
  const isOwner = email && email.toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase();
  pin = String(pin || '');

  if (isOwner || pin === CONFIG.ADMIN_PIN) return { isAdmin: true, who: email || 'מנהל' };
  if (pin === CONFIG.BAR_PIN) return { isAdmin: false, who: email || 'בר' };

  if (pin) cache.put('pinFails', String(fails + 1), 600);
  throw new Error('PIN_REQUIRED');
}

function requireAdmin_(pin) {
  const a = auth_(pin);
  if (!a.isAdmin) throw new Error('אין הרשאה – למנהל בלבד');
  return a;
}

/* ---------- טעינה ראשונית ---------- */

function api_init(pin) {
  const a = auth_(pin);
  const p = getOpenPeriod_();
  if (!p) throw new Error('אין חודש פתוח. הרץ setup.');
  const res = {
    isAdmin: a.isAdmin,
    pubName: CONFIG.PUB_NAME,
    period: { title: p.title, start: fmt_(p.start, 'dd/MM/yyyy HH:mm') },
    types: getTicketTypes_(false),
    members: getMembers_(false),
    shift: getShiftState_(a),
    todos: getTodos_(),
  };
  if (a.isAdmin) {
    res.reportUrl = p.reportUrl;
    res.expenses = getExpensesState_();
  }
  return res;
}

function api_members(pin) {
  auth_(pin);
  return getMembers_(true);
}

/* ---------- מכירה ---------- */

/**
 * req = { id, memberKey } או { id, last, first } עבור מי שלא ברשימה,
 *       + type, qty, note
 */
function api_sell(pin, req) {
  const a = auth_(pin);
  req = req || {};
  const id = cleanText_(req.id, 60);
  if (!id) throw new Error('בקשה לא תקינה');
  const qty = Math.floor(Number(req.qty));
  if (!(qty >= 1 && qty <= CONFIG.MAX_QTY)) throw new Error('כמות לא תקינה');
  const type = getTicketTypes_(false).find(t => t.name === req.type);
  if (!type) throw new Error('סוג הכרטיסייה לא קיים או לא פעיל');

  let last, first, key, inList;
  if (req.memberKey) {
    const m = getMembers_(false).find(x => x.key === req.memberKey) ||
              getMembers_(true).find(x => x.key === req.memberKey);
    if (!m) throw new Error('החבר לא נמצא ברשימה – רענן את הרשימה');
    last = m.last; first = m.first; key = m.key; inList = true;
  } else {
    last = cleanText_(req.last, 60);
    first = cleanText_(req.first, 60);
    if (!last && !first) throw new Error('יש להזין שם');
    key = 'guest|' + last + '|' + first;
    inList = false;
  }
  const note = cleanText_(req.note, 200);

  withLock_(() => {
    const sh = sheet_(SHEETS.SALES);
    if (findRowById_(sh, id)) return; // כבר נרשם (לחיצה כפולה / ניסיון חוזר) – לא רושמים פעמיים
    const p = getOpenPeriod_();
    const now = new Date();
    sh.appendRow([
      asText_(id), now, asText_(p.key), asText_(shiftDate_(now)),
      asText_(last), asText_(first), asText_(key), inList ? 'כן' : 'לא',
      asText_(type.name), qty, type.price, qty * type.price,
      note ? asText_(note) : '', asText_(a.who), ACTIVE, '', '',
    ]);
  });
  return getShiftState_(a);
}

function api_voidSale(pin, id) {
  const a = auth_(pin);
  withLock_(() => {
    const sh = sheet_(SHEETS.SALES);
    const row = findRowById_(sh, id);
    if (!row) throw new Error('הרישום לא נמצא');
    const r = sh.getRange(row, 1, 1, SALES_HEADERS.length).getValues()[0];
    if (r[S.STATUS] === VOIDED) return;
    const p = getOpenPeriod_();
    if (keyOf_(r[S.PERIOD]) !== p.key) throw new Error('החודש של הרישום כבר נסגר – לא ניתן לבטל');
    const ageMin = (Date.now() - new Date(r[S.TS]).getTime()) / 60000;
    if (!a.isAdmin && ageMin > CONFIG.BAR_UNDO_MINUTES) {
      throw new Error('אפשר לבטל רק ' + CONFIG.BAR_UNDO_MINUTES + ' דקות אחרי הרישום. פנה למנהל');
    }
    sh.getRange(row, S.STATUS + 1, 1, 3).setValues([[VOIDED, new Date(), asText_(a.who)]]);
  });
  return getShiftState_(a);
}

function api_shift(pin) {
  return getShiftState_(auth_(pin));
}

/** סיכום המשמרת הנוכחית + רישומים אחרונים */
function getShiftState_(a) {
  const sh = sheet_(SHEETS.SALES);
  const last = sh.getLastRow();
  const today = shiftDate_(new Date());
  const out = { date: today, tickets: 0, amount: 0, recent: [] };
  if (last < 2) return out;
  const n = Math.min(400, last - 1);
  const rows = sh.getRange(last - n + 1, 1, n, SALES_HEADERS.length).getValues();
  const now = Date.now();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (dayOf_(r[S.SHIFT]) !== today) continue;
    const isActive = r[S.STATUS] !== VOIDED;
    if (isActive) { out.tickets += Number(r[S.QTY]); out.amount += Number(r[S.TOTAL]); }
    if (out.recent.length < 40) {
      const ts = new Date(r[S.TS]);
      out.recent.push({
        id: keyOf_(r[S.ID]),
        time: fmt_(ts, 'HH:mm'),
        name: (keyOf_(r[S.FIRST]) + ' ' + keyOf_(r[S.LAST])).trim(),
        type: keyOf_(r[S.TYPE]),
        qty: Number(r[S.QTY]),
        total: Number(r[S.TOTAL]),
        note: keyOf_(r[S.NOTE]),
        inList: r[S.INLIST] === 'כן',
        voided: !isActive,
        canUndo: isActive && (a.isAdmin || (now - ts.getTime()) / 60000 <= CONFIG.BAR_UNDO_MINUTES),
      });
    }
  }
  return out;
}

/* ---------- הוצאות (מנהל בלבד) ---------- */

/** req = { id, date: 'yyyy-MM-dd', desc, amount } */
function api_addExpense(pin, req) {
  const a = requireAdmin_(pin);
  req = req || {};
  const id = cleanText_(req.id, 60);
  const desc = cleanText_(req.desc, 200);
  const amount = Math.round(Number(req.amount) * 100) / 100;
  if (!id) throw new Error('בקשה לא תקינה');
  if (!desc) throw new Error('יש להזין פירוט');
  if (!(amount > 0 && amount < 1000000)) throw new Error('סכום לא תקין');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.date))) throw new Error('תאריך לא תקין');
  const date = Utilities.parseDate(req.date, tz_(), 'yyyy-MM-dd');
  if (date.getTime() > Date.now() + 24 * 3600 * 1000) throw new Error('תאריך עתידי');

  let warning = '';
  withLock_(() => {
    const sh = sheet_(SHEETS.EXPENSES);
    if (findRowById_(sh, id)) return;
    const p = getOpenPeriod_();
    if (fmt_(date, 'yyyy-MM-dd') < fmt_(p.start, 'yyyy-MM-dd')) {
      warning = 'התאריך שייך לחודש שכבר נסגר – ההוצאה נרשמה בחודש הנוכחי (' + p.title + ')';
    }
    sh.appendRow([asText_(id), new Date(), asText_(p.key), date, asText_(desc), amount, asText_(a.who), ACTIVE, '', '']);
  });
  const state = getExpensesState_();
  state.warning = warning;
  return state;
}

function api_voidExpense(pin, id) {
  const a = requireAdmin_(pin);
  withLock_(() => {
    const sh = sheet_(SHEETS.EXPENSES);
    const row = findRowById_(sh, id);
    if (!row) throw new Error('ההוצאה לא נמצאה');
    const r = sh.getRange(row, 1, 1, EXPENSE_HEADERS.length).getValues()[0];
    if (r[E.STATUS] === VOIDED) return;
    if (keyOf_(r[E.PERIOD]) !== getOpenPeriod_().key) throw new Error('החודש כבר נסגר – לא ניתן לבטל');
    sh.getRange(row, E.STATUS + 1, 1, 3).setValues([[VOIDED, new Date(), asText_(a.who)]]);
  });
  return getExpensesState_();
}

function api_expenses(pin) {
  requireAdmin_(pin);
  return getExpensesState_();
}

function getExpensesState_() {
  const p = getOpenPeriod_();
  const items = dataRows_(sheet_(SHEETS.EXPENSES))
    .filter(r => keyOf_(r[E.PERIOD]) === p.key && r[E.STATUS] !== VOIDED)
    .map(r => ({
      id: keyOf_(r[E.ID]),
      date: r[E.DATE] instanceof Date ? fmt_(r[E.DATE], 'dd/MM') : String(r[E.DATE]),
      sortKey: r[E.DATE] instanceof Date ? r[E.DATE].getTime() : 0,
      desc: keyOf_(r[E.DESC]),
      amount: Number(r[E.AMOUNT]),
    }))
    .sort((x, y) => y.sortKey - x.sortKey);
  return { items: items, total: items.reduce((s, x) => s + x.amount, 0), periodTitle: p.title };
}

/* ---------- דוח ---------- */

function api_refreshReport(pin) {
  requireAdmin_(pin);
  const p = getOpenPeriod_();
  buildReport_(p, false);
  return getOpenPeriod_().reportUrl;
}

/* ---------- רשימת חוסרים (לכל המשתמשים) ---------- */

/** יוצר את הלשונית אם עוד לא קיימת – כך אין צורך להריץ setup מחדש */
function getTodoSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEETS.TODO);
  if (!sh) {
    sh = ensureSheet_(ss, SHEETS.TODO, TODO_HEADERS, [], { 4: 'dd/MM/yyyy HH:mm', 6: 'dd/MM/yyyy HH:mm' });
    sh.protect().setWarningOnly(true).setDescription('נכתב ע"י האפליקציה – לא לערוך ידנית');
  }
  return sh;
}

function getTodos_() {
  const rows = dataRows_(getTodoSheet_()).filter(r => r[T.STATUS] !== TODO_DELETED && keyOf_(r[T.ID]));
  const item = r => {
    const created = r[T.CREATED] instanceof Date ? r[T.CREATED] : new Date(r[T.CREATED]);
    const updated = r[T.UPDATED] instanceof Date ? r[T.UPDATED] : created;
    return { id: keyOf_(r[T.ID]), text: keyOf_(r[T.TEXT]), done: r[T.STATUS] === TODO_DONE,
      date: fmt_(created, 'dd/MM'), c: created.getTime(), u: updated.getTime() };
  };
  const all = rows.map(item);
  const open = all.filter(x => !x.done).sort((a, b) => b.c - a.c);           // החדש למעלה
  const done = all.filter(x => x.done).sort((a, b) => b.u - a.u).slice(0, 25); // 25 האחרונים שנקנו
  return open.concat(done);
}

function api_todos(pin) {
  auth_(pin);
  return getTodos_();
}

function api_addTodo(pin, req) {
  const a = auth_(pin);
  req = req || {};
  const id = cleanText_(req.id, 60);
  const text = cleanText_(req.text, 120);
  if (!id || !text) throw new Error('יש להזין פריט');
  withLock_(() => {
    const sh = getTodoSheet_();
    if (findRowById_(sh, id)) return;
    const now = new Date();
    sh.appendRow([asText_(id), asText_(text), TODO_OPEN, now, asText_(a.who), now, asText_(a.who)]);
  });
  return getTodos_();
}

/** req = { id, text? , done? } */
function api_updateTodo(pin, req) {
  const a = auth_(pin);
  req = req || {};
  withLock_(() => {
    const sh = getTodoSheet_();
    const row = findRowById_(sh, req.id);
    if (!row) throw new Error('הפריט לא נמצא');
    if (sh.getRange(row, T.STATUS + 1).getValue() === TODO_DELETED) throw new Error('מישהו אחר כבר מחק את הפריט');
    if (req.text !== undefined && req.text !== null) {
      const text = cleanText_(req.text, 120);
      if (!text) throw new Error('הפריט לא יכול להיות ריק');
      sh.getRange(row, T.TEXT + 1).setValue(asText_(text));
    }
    if (req.done !== undefined && req.done !== null) {
      sh.getRange(row, T.STATUS + 1).setValue(req.done ? TODO_DONE : TODO_OPEN);
    }
    sh.getRange(row, T.UPDATED + 1, 1, 2).setValues([[new Date(), asText_(a.who)]]);
  });
  return getTodos_();
}

/** מחיקה = סימון "נמחק". השורה נשארת בגיליון לתיעוד */
function api_deleteTodo(pin, id) {
  const a = auth_(pin);
  withLock_(() => {
    const sh = getTodoSheet_();
    const row = findRowById_(sh, id);
    if (!row) return;
    sh.getRange(row, T.STATUS + 1).setValue(TODO_DELETED);
    sh.getRange(row, T.UPDATED + 1, 1, 2).setValues([[new Date(), asText_(a.who)]]);
  });
  return getTodos_();
}
