import { describe, expect, it } from 'vitest';
import { formatAgorot, parseShekelInput, toAgorot, toShekels } from '../src/shared/money';

describe('M1 sheet conversion', () => {
  it('round-trips shekel numbers exactly', () => {
    for (const s of [0, 1, 12.3, 12.35, 0.1, 0.2, 999999.99, 50]) {
      expect(toShekels(toAgorot(s))).toBe(s);
    }
  });
  it('removes float noise', () => {
    expect(toAgorot(12.3)).toBe(1230);
    expect(toAgorot(0.1 + 0.2)).toBe(30);
    expect(toAgorot(1.005)).toBe(101); // naive Math.round(1.005*100) would give 100
    expect(toAgorot(-12.3)).toBe(-1230);
  });
  it('reads strings and bad cells', () => {
    expect(toAgorot('₪1,200')).toBe(120000);
    expect(toAgorot('')).toBe(0);
    expect(toAgorot('abc')).toBe(0);
  });
});

describe('M2 parsing user input', () => {
  it('accepts valid amounts', () => {
    expect(parseShekelInput('12')).toBe(1200);
    expect(parseShekelInput('12.5')).toBe(1250);
    expect(parseShekelInput('12.50')).toBe(1250);
    expect(parseShekelInput('0.01')).toBe(1);
    expect(parseShekelInput('₪ 1,200')).toBe(120000);
    expect(parseShekelInput(7)).toBe(700);
  });
  it('rejects bad input', () => {
    for (const s of ['', ' ', '-5', '1.234', 'abc', '1e3', '.5', '1.', null, undefined, NaN]) {
      expect(parseShekelInput(s as never)).toBeNull();
    }
  });
});

describe('formatAgorot', () => {
  it('formats', () => {
    expect(formatAgorot(0)).toBe('₪0');
    expect(formatAgorot(120000)).toBe('₪1,200');
    expect(formatAgorot(1230)).toBe('₪12.30');
    expect(formatAgorot(-500)).toBe('-₪5');
  });
});
