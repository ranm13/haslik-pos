import { describe, expect, it } from 'vitest';
import { canUndo, checkVoid, saleTotal, validateSaleInput } from '../src/core/sales';
import { AppError } from '../src/core/errors';

describe('S1 sale input', () => {
  it('accepts a member sale', () => {
    expect(validateSaleInput({ memberId: 'M00001', cardType: 'רגילה', qty: 2, note: '  x ' }))
      .toEqual({ memberId: 'M00001', cardType: 'רגילה', qty: 2, note: 'x' });
  });
  it('accepts a guest sale and cleans names', () => {
    expect(validateSaleInput({ guest: { first: ' ישראל ', last: 'ישראלי\n' }, cardType: 'רגילה', qty: 1 }).guest)
      .toEqual({ first: 'ישראל', last: 'ישראלי' });
  });
  it('rejects qty outside 1..20 and non-integers', () => {
    for (const qty of [0, 21, 1.5, -1, NaN]) {
      expect(() => validateSaleInput({ memberId: 'M1', cardType: 'רגילה', qty })).toThrow(AppError);
    }
  });
  it('rejects a guest without a name and a missing card type', () => {
    expect(() => validateSaleInput({ guest: { first: '', last: ' ' }, cardType: 'רגילה', qty: 1 })).toThrow('יש להזין שם');
    expect(() => validateSaleInput({ memberId: 'M1', cardType: '', qty: 1 })).toThrow();
  });
  it('totals in agorot', () => {
    expect(saleTotal(5000, 3)).toBe(15000);
  });
});

describe('S3/S4 void rules', () => {
  const base = { role: 'bar' as const, status: 'active' as const, salePeriodKey: '2026-11', openPeriodKey: '2026-11', ageMinutes: 10 };
  it('bar within 30 minutes', () => {
    expect(checkVoid(base)).toBe('ok');
    expect(checkVoid({ ...base, ageMinutes: 30 })).toBe('ok');
    expect(() => checkVoid({ ...base, ageMinutes: 31 })).toThrow('פנה למנהל');
  });
  it('admin any time in the open month', () => {
    expect(checkVoid({ ...base, role: 'admin', ageMinutes: 60 * 24 * 20 })).toBe('ok');
  });
  it('nobody in a closed month', () => {
    expect(() => checkVoid({ ...base, role: 'admin', salePeriodKey: '2026-10' })).toThrow('נסגר');
  });
  it('voiding twice is a no-op', () => {
    expect(checkVoid({ ...base, status: 'voided', ageMinutes: 999 })).toBe('noop');
  });
  it('canUndo mirrors the rules', () => {
    expect(canUndo('bar', false, 29)).toBe(true);
    expect(canUndo('bar', false, 31)).toBe(false);
    expect(canUndo('admin', false, 999)).toBe(true);
    expect(canUndo('admin', true, 1)).toBe(false);
  });
});
