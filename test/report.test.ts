import { describe, expect, it } from 'vitest';
import { buildExpenses, buildIncome, netProfit, type ReportSale } from '../src/core/report';
import { he } from './helpers';

const sale = (o: Partial<ReportSale>): ReportSale => ({
  memberRef: 'M00001', last: 'ישראלי', first: 'ישראל', inList: true, cardType: 'רגילה',
  unitPriceAgorot: 5000, qty: 1, totalAgorot: 5000, note: '', shiftDate: '2026-11-19', ...o,
});

describe('P2 income', () => {
  it('sums per buyer and in total (only the sales passed in, i.e. active ones)', () => {
    const inc = buildIncome([
      sale({ qty: 2, totalAgorot: 10000 }),
      sale({ memberRef: 'M00002', last: 'כהן', first: 'דנה', note: 'עבור חבר' }),
      sale({ shiftDate: '2026-11-20' }),
    ], he);
    expect(inc.multi).toBe(false);
    expect(inc.buyers).toBe(2);
    expect(inc.cardCount).toBe(4);
    expect(inc.amountAgorot).toBe(20000);
    expect(inc.shifts).toBe(2);
    expect(inc.rows.map(r => r.last)).toEqual(['ישראלי', 'כהן']);
    expect(inc.rows[1].notes).toBe('עבור חבר');
  });
  it('splits columns per card type+price when more than one appears', () => {
    const inc = buildIncome([
      sale({ cardType: 'רגילה', unitPriceAgorot: 5000, totalAgorot: 5000 }),
      sale({ cardType: 'מוזלת', unitPriceAgorot: 3000, totalAgorot: 6000, qty: 2 }),
    ], he);
    expect(inc.multi).toBe(true);
    expect(inc.types.map(t => t.name)).toEqual(['מוזלת', 'רגילה']);
    expect(inc.rows[0].byType).toEqual([2, 1]);
    expect(inc.perType).toEqual([
      { label: 'מוזלת (₪30)', qty: 2, amountAgorot: 6000 },
      { label: 'רגילה (₪50)', qty: 1, amountAgorot: 5000 },
    ]);
  });
  it('marks guests "לא ברשימה"', () => {
    const inc = buildIncome([sale({ memberRef: 'guest|x|y', inList: false, note: 'n' })], he);
    expect(inc.rows[0].notes).toBe('לא ברשימה · n');
  });
});

describe('P4 grouping by resolved member', () => {
  it('a renamed member stays one row', () => {
    const inc = buildIncome([
      sale({ memberRef: 'M00007', last: 'לוי', first: 'רות' }),
      sale({ memberRef: 'M00007', last: 'לוי-כהן', first: 'רות' }),
    ], he);
    expect(inc.rows).toHaveLength(1);
    expect(inc.rows[0].qty).toBe(2);
  });
});

describe('P3 report net profit', () => {
  it('income − (expenses − credits)', () => {
    const inc = buildIncome([sale({ qty: 4, totalAgorot: 20000 })], he);
    const exp = buildExpenses([
      { date: '2026-11-02', desc: 'a', amountAgorot: 8000, type: 'EXPENSE' },
      { date: '2026-11-01', desc: 'b', amountAgorot: 1000, type: 'CREDIT' },
    ]);
    expect(exp.rows[0].desc).toBe('b'); // sorted by date
    expect(netProfit(inc, exp)).toBe(20000 - 7000);
  });
});
