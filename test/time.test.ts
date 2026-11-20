import { describe, expect, it } from 'vitest';
import { isLastDayOfMonth, nextMonthKey, nextPeriodKeyOnClose, periodTitle, shiftDate, shouldClose } from '../src/core/time';
import { fmt, il } from './helpers';

describe('S5 shift date', () => {
  it('assigns early-morning sales to the previous evening', () => {
    expect(shiftDate(fmt, il('2026-11-20 01:30'), 8)).toBe('2026-11-19');
    expect(shiftDate(fmt, il('2026-11-20 07:59'), 8)).toBe('2026-11-19');
    expect(shiftDate(fmt, il('2026-11-20 08:00'), 8)).toBe('2026-11-20');
    expect(shiftDate(fmt, il('2026-11-19 22:00'), 8)).toBe('2026-11-19');
  });
  it('is correct across DST start (27 Mar 2026) and end (25 Oct 2026)', () => {
    expect(shiftDate(fmt, il('2026-03-27 05:00'), 8)).toBe('2026-03-26');
    expect(shiftDate(fmt, il('2026-10-25 05:00'), 8)).toBe('2026-10-24');
  });
});

describe('P1 periods', () => {
  it('computes next month keys across year end', () => {
    expect(nextMonthKey('2026-11')).toBe('2026-12');
    expect(nextMonthKey('2026-12')).toBe('2027-01');
  });
  it('titles in Hebrew', () => {
    expect(periodTitle('2026-11')).toBe('נובמבר 2026');
  });
  it('detects the last day of the month (incl. February and DST days)', () => {
    expect(isLastDayOfMonth(fmt, il('2026-11-30 09:00'))).toBe(true);
    expect(isLastDayOfMonth(fmt, il('2026-11-29 23:30'))).toBe(false);
    expect(isLastDayOfMonth(fmt, il('2026-02-28 08:00'))).toBe(true);
    expect(isLastDayOfMonth(fmt, il('2028-02-28 08:00'))).toBe(false); // leap year
    expect(isLastDayOfMonth(fmt, il('2026-10-31 08:00'))).toBe(true);
    expect(isLastDayOfMonth(fmt, il('2026-03-31 23:59'))).toBe(true);
  });
  it('closes on the last day from 08:00, or when overdue', () => {
    expect(shouldClose(fmt, '2026-11', il('2026-11-30 07:59'), 8)).toBe(false);
    expect(shouldClose(fmt, '2026-11', il('2026-11-30 08:00'), 8)).toBe(true);
    expect(shouldClose(fmt, '2026-11', il('2026-11-15 08:00'), 8)).toBe(false);
    expect(shouldClose(fmt, '2026-10', il('2026-11-02 08:00'), 8)).toBe(true);
  });
  it('picks the next period key on close', () => {
    expect(nextPeriodKeyOnClose(fmt, '2026-11', il('2026-11-30 08:00'), 8)).toBe('2026-12');
    expect(nextPeriodKeyOnClose(fmt, '2026-10', il('2026-11-02 08:00'), 8)).toBe('2026-11');
    expect(nextPeriodKeyOnClose(fmt, '2026-12', il('2026-12-31 09:00'), 8)).toBe('2027-01');
  });
});
