import { describe, expect, it } from 'vitest';
import { applyRestock, planShortage, restockDelta, shortageDelta, validateAmount, validateItemName, validateShortageQty } from '../src/core/inventory';

describe('I3 ticking "נקנה" restocks the item', () => {
  it('open → bought adds the amount, bought → open takes it back', () => {
    expect(restockDelta(false, true, 'i1', 6)).toBe(6);
    expect(restockDelta(true, false, 'i1', 6)).toBe(-6);
  });
  it('no change: same status (retry), manual line, or no amount', () => {
    expect(restockDelta(true, true, 'i1', 6)).toBe(0);
    expect(restockDelta(false, true, '', 6)).toBe(0);
    expect(restockDelta(false, true, 'i1', null)).toBe(0);
  });
  it('taking back never goes below 0', () => {
    expect(applyRestock(2, -6)).toBe(0);
    expect(applyRestock(2, 6)).toBe(8);
  });
});

describe('I1 inventory input', () => {
  it('amount: whole number 0…100,000', () => {
    expect(validateAmount(0)).toBe(0);
    expect(validateAmount('12')).toBe(12);
    for (const bad of [-1, 1.5, 'abc', '', null, 100_001]) expect(() => validateAmount(bad)).toThrow('כמות');
  });
  it('item name is required and trimmed', () => {
    expect(validateItemName('  בירה  גולדסטאר ')).toBe('בירה גולדסטאר');
    expect(() => validateItemName('   ')).toThrow('שם');
  });
  it('shortage amount: blank = none, otherwise 1 or more', () => {
    expect(validateShortageQty('')).toBeNull();
    expect(validateShortageQty(null)).toBeNull();
    expect(validateShortageQty(3)).toBe(3);
    expect(() => validateShortageQty(0)).toThrow();
    expect(() => validateShortageQty(2.5)).toThrow();
  });
});

describe('I2 every decrease goes to the shortages list', () => {
  it('only decreases count, by their size', () => {
    expect(shortageDelta(10, 7)).toBe(3);
    expect(shortageDelta(7, 10)).toBe(0);
    expect(shortageDelta(5, 5)).toBe(0);
  });
  it('creates a line, or counts up the open one', () => {
    expect(planShortage(3, null)).toEqual({ kind: 'create', qty: 3 });
    expect(planShortage(2, { row: 9, qty: 3 })).toEqual({ kind: 'increase', row: 9, qty: 5 });
    expect(planShortage(2, { row: 9, qty: null })).toEqual({ kind: 'increase', row: 9, qty: 2 });
    expect(planShortage(0, null)).toEqual({ kind: 'none' });
  });
  it('a retry of the same absolute amount adds nothing (idempotent)', () => {
    // the page always sends the new absolute amount; the server computes the delta from the stored one
    const stored = 7; // after the first, successful request (10 → 7)
    expect(shortageDelta(stored, 7)).toBe(0);
  });
});
