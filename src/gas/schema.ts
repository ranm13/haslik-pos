/**
 * Sheet names and column layouts. Legacy sheets keep their Hebrew names and column order (docs/DATA_MODEL.md).
 * Stage 1 adds no columns to existing sheets; the only new sheet is `Audit`.
 */

export const SHEETS = {
  SALES: 'יומן מכירות',
  EXPENSES: 'יומן הוצאות',
  TYPES: 'סוגי כרטיסיות',
  PERIODS: 'תקופות',
  TODO: 'חוסרים',
  AUDIT: 'Audit',
} as const;

export const SALES_HEADERS = ['מזהה', 'זמן רישום', 'חודש', 'תאריך משמרת', 'שם משפחה', 'שם פרטי', 'מפתח חבר',
  'ברשימה', 'סוג כרטיסייה', 'כמות', 'מחיר יחידה', 'סה"כ', 'הערות', 'נרשם ע"י', 'סטטוס', 'בוטל בזמן', 'בוטל ע"י'];
export const S = { ID: 0, TS: 1, PERIOD: 2, SHIFT: 3, LAST: 4, FIRST: 5, KEY: 6, INLIST: 7, TYPE: 8, QTY: 9,
  PRICE: 10, TOTAL: 11, NOTE: 12, BY: 13, STATUS: 14, VOID_AT: 15, VOID_BY: 16 } as const;

export const EXPENSE_HEADERS = ['מזהה', 'זמן רישום', 'חודש', 'תאריך הוצאה', 'פירוט', 'סכום', 'נרשם ע"י', 'סטטוס',
  'בוטל בזמן', 'בוטל ע"י'];
export const E = { ID: 0, TS: 1, PERIOD: 2, DATE: 3, DESC: 4, AMOUNT: 5, BY: 6, STATUS: 7, VOID_AT: 8, VOID_BY: 9 } as const;

export const TYPES_HEADERS = ['שם', 'מחיר', 'פעיל'];

export const PERIOD_HEADERS = ['חודש', 'שם', 'התחלה', 'סיום', 'מזהה דוח', 'קישור לדוח', 'סטטוס'];
export const P = { KEY: 0, TITLE: 1, START: 2, END: 3, REPORT_ID: 4, REPORT_URL: 5, STATUS: 6 } as const;

export const TODO_HEADERS = ['מזהה', 'פריט', 'סטטוס', 'נוצר', 'נוצר ע"י', 'עודכן', 'עודכן ע"י'];
export const T = { ID: 0, TEXT: 1, STATUS: 2, CREATED: 3, CREATED_BY: 4, UPDATED: 5, UPDATED_BY: 6 } as const;

export const AUDIT_HEADERS = ['timestamp', 'action', 'actor', 'clientTxId', 'payload'];

export const ACTIVE = 'פעיל';
export const VOIDED = 'בוטל';
export const OPEN = 'פתוח';
export const CLOSED = 'סגור';
export const TODO_OPEN = 'חסר';
export const TODO_DONE = 'נקנה';
export const TODO_DELETED = 'נמחק';
