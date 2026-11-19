/**
 * Pure aggregation for the monthly report (same layout as legacy Report.gs).
 * The Apps Script layer only writes these numbers into the report spreadsheet.
 */
import type { ExpenseType } from '../../../shared/api';
import type { Agorot } from '../../../shared/money';
import { expenseTotals, type ExpenseTotals } from './expenses';

export interface ReportSale {
  memberRef: string;      // resolved memberId (stage 2) or legacy key
  last: string;
  first: string;
  inList: boolean;
  cardType: string;
  unitPriceAgorot: Agorot;
  qty: number;
  totalAgorot: Agorot;
  note: string;
  shiftDate: string;
}

export interface ReportType { k: string; name: string; priceAgorot: Agorot }

export interface IncomeRow {
  last: string;
  first: string;
  byType: number[];       // qty per ReportType (same order), only meaningful when multi
  qty: number;
  amountAgorot: Agorot;
  notes: string;
}

export interface Income {
  types: ReportType[];
  multi: boolean;
  rows: IncomeRow[];
  cardCount: number;
  amountAgorot: Agorot;
  buyers: number;
  shifts: number;
  perType: { label: string; qty: number; amountAgorot: Agorot }[];
}

const typeKey = (name: string, price: Agorot) => name + '|' + price;

export function buildIncome(sales: readonly ReportSale[], compare: (a: string, b: string) => number): Income {
  const typeMap = new Map<string, ReportType>();
  for (const s of sales) typeMap.set(typeKey(s.cardType, s.unitPriceAgorot), { k: typeKey(s.cardType, s.unitPriceAgorot), name: s.cardType, priceAgorot: s.unitPriceAgorot });
  const types = [...typeMap.values()].sort((a, b) => a.priceAgorot - b.priceAgorot);
  const multi = types.length > 1;

  interface Acc { last: string; first: string; inList: boolean; byType: Map<string, number>; qty: number; amount: Agorot; notes: string[] }
  const people = new Map<string, Acc>();
  for (const s of sales) {
    let p = people.get(s.memberRef);
    if (!p) {
      p = { last: s.last, first: s.first, inList: s.inList, byType: new Map(), qty: 0, amount: 0, notes: [] };
      people.set(s.memberRef, p);
    }
    const k = typeKey(s.cardType, s.unitPriceAgorot);
    p.byType.set(k, (p.byType.get(k) || 0) + s.qty);
    p.qty += s.qty;
    p.amount += s.totalAgorot;
    if (s.note && !p.notes.includes(s.note)) p.notes.push(s.note);
  }

  const rows: IncomeRow[] = [...people.values()]
    .sort((a, b) => compare(a.last + ' ' + a.first, b.last + ' ' + b.first))
    .map(p => {
      const notes = p.notes.slice();
      if (!p.inList) notes.unshift('לא ברשימה');
      return {
        last: p.last,
        first: p.first,
        byType: types.map(t => p.byType.get(t.k) || 0),
        qty: p.qty,
        amountAgorot: p.amount,
        notes: notes.join(' · '),
      };
    });

  const perType = types.map((t, i) => {
    const qty = rows.reduce((s, r) => s + r.byType[i], 0);
    return { label: t.name + ' (₪' + t.priceAgorot / 100 + ')', qty, amountAgorot: qty * t.priceAgorot };
  });

  return {
    types,
    multi,
    rows,
    cardCount: rows.reduce((s, r) => s + r.qty, 0),
    amountAgorot: rows.reduce((s, r) => s + r.amountAgorot, 0),
    buyers: rows.length,
    shifts: new Set(sales.map(s => s.shiftDate)).size,
    perType,
  };
}

export interface ReportExpense { date: Date | string; desc: string; amountAgorot: Agorot; type: ExpenseType }

export interface ExpensesSection extends ExpenseTotals {
  rows: ReportExpense[];
  count: number;
}

export function buildExpenses(expenses: readonly ReportExpense[]): ExpensesSection {
  const rows = expenses.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { rows, count: rows.length, ...expenseTotals(rows) };
}

/** Net profit = income − (expenses − credits). */
export function netProfit(income: Income, exp: ExpensesSection): Agorot {
  return income.amountAgorot - exp.netAgorot;
}
