import { describe, expect, it } from 'vitest';
import { bookingWarning, expenseChangeError, expenseTotals, typeFromLabel, validateExpenseInput } from '../src/core/expenses';

describe('E3 editing an expense', () => {
  it('allowed only for an active row in the open month', () => {
    expect(expenseChangeError(false, '2026-11', '2026-11')).toBe('');
    expect(expenseChangeError(true, '2026-11', '2026-11')).toContain('בוטלה');
    expect(expenseChangeError(false, '2026-10', '2026-11')).toContain('נסגר');
  });
});

describe('E1 expense input', () => {
  const ok = { date: '2026-11-19', desc: 'מונימרקט – שתייה', amountAgorot: 12350 };
  it('accepts valid input, defaults type to EXPENSE', () => {
    expect(validateExpenseInput(ok, '2026-11-20')).toEqual({ ...ok, type: 'EXPENSE' });
    expect(validateExpenseInput({ ...ok, type: 'CREDIT' }, '2026-11-20').type).toBe('CREDIT');
  });
  it('rejects bad amounts', () => {
    for (const amountAgorot of [0, -1, 1.5, 100_000_000, NaN]) {
      expect(() => validateExpenseInput({ ...ok, amountAgorot }, '2026-11-20')).toThrow('סכום');
    }
  });
  it('rejects bad and future dates, allows tomorrow', () => {
    expect(() => validateExpenseInput({ ...ok, date: '2026-02-30' }, '2026-11-20')).toThrow('תאריך');
    expect(() => validateExpenseInput({ ...ok, date: '19/11/2026' }, '2026-11-20')).toThrow('תאריך');
    expect(() => validateExpenseInput({ ...ok, date: '2026-11-21' }, '2026-11-20')).toThrow('עתידי');
    expect(validateExpenseInput({ ...ok, date: '2026-11-20' }, '2026-11-20').date).toBe('2026-11-20');
  });
  it('requires a description', () => {
    expect(() => validateExpenseInput({ ...ok, desc: '   ' }, '2026-11-20')).toThrow('פירוט');
  });
});

describe('E2 booking into the open period', () => {
  it('warns when dated before the open period', () => {
    expect(bookingWarning('2026-10-31', '2026-11-01', 'נובמבר 2026')).toContain('נובמבר 2026');
    expect(bookingWarning('2026-11-01', '2026-11-01', 'נובמבר 2026')).toBe('');
  });
});

describe('P3 credits and net', () => {
  it('nets credits against expenses', () => {
    expect(expenseTotals([
      { amountAgorot: 10000, type: 'EXPENSE' },
      { amountAgorot: 2500, type: 'CREDIT' },
      { amountAgorot: 500, type: 'EXPENSE' },
    ])).toEqual({ expensesAgorot: 10500, creditsAgorot: 2500, netAgorot: 8000 });
  });
  it('blank type label counts as EXPENSE', () => {
    expect(typeFromLabel('')).toBe('EXPENSE');
    expect(typeFromLabel("'זיכוי")).toBe('CREDIT');
    expect(typeFromLabel('הוצאה')).toBe('EXPENSE');
  });
});
