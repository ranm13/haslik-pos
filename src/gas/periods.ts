import { periodTitle } from '../core/time';
import { asText } from '../core/text';
import { AppError } from '../core/errors';
import { dataRows, sheet } from './sheets';
import { OPEN, P, SHEETS } from './schema';
import { fmt, keyOf, toDate } from './util';
import type { Period } from '../shared/api';

export interface PeriodRow {
  row: number;
  key: string;
  title: string;
  start: Date;
  end: Date | null;
  reportId: string;
  reportUrl: string;
  status: string;
}

function fromRow(r: unknown[], row: number): PeriodRow {
  const key = keyOf(r[P.KEY]);
  return {
    row,
    key,
    title: periodTitle(key), // always computed: Sheets turns "אוקטובר 2026" into a date
    start: toDate(r[P.START]),
    end: r[P.END] instanceof Date ? r[P.END] as Date : null,
    reportId: String(r[P.REPORT_ID] || ''),
    reportUrl: String(r[P.REPORT_URL] || ''),
    status: String(r[P.STATUS]),
  };
}

export function getOpenPeriod(): PeriodRow | null {
  const rows = dataRows(sheet(SHEETS.PERIODS));
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][P.STATUS] === OPEN) return fromRow(rows[i], i + 2);
  }
  return null;
}

export function requireOpenPeriod(): PeriodRow {
  const p = getOpenPeriod();
  if (!p) throw new AppError('NOT_CONFIGURED', 'אין חודש פתוח. יש להריץ setup.');
  return p;
}

export function getPeriodByKey(key: string): PeriodRow | null {
  const rows = dataRows(sheet(SHEETS.PERIODS));
  for (let i = rows.length - 1; i >= 0; i--) {
    if (keyOf(rows[i][P.KEY]) === key) return fromRow(rows[i], i + 2);
  }
  return null;
}

export function appendOpenPeriod(key: string, start: Date): void {
  sheet(SHEETS.PERIODS).appendRow([asText(key), asText(periodTitle(key)), start, '', '', '', OPEN]);
}

export function periodDto(p: PeriodRow): Period {
  return { key: p.key, title: p.title, start: fmt(p.start, 'dd/MM/yyyy HH:mm') };
}
