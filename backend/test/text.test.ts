import { describe, expect, it } from 'vitest';
import { asText, cleanText, fromText, nextSequentialId } from '../src/core/text';
import { matchesQuery, normalizeSearch } from '../../shared/search';

describe('T1 sheet text safety', () => {
  it('prefixes with an apostrophe so formulas are never evaluated', () => {
    expect(asText('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(fromText(asText('שלום'))).toBe('שלום');
  });
  it('strips control characters and collapses whitespace', () => {
    expect(cleanText('  a\tb\n\nc\u0007 ', 10)).toBe('a b c');
    expect(cleanText('x'.repeat(50), 5)).toBe('xxxxx');
    expect(cleanText(null)).toBe('');
  });
});

describe('ids', () => {
  it('sequential ids ignore other prefixes', () => {
    expect(nextSequentialId('M', ['M00002', 'X99999', 'M00010'], 5)).toBe('M00011');
    expect(nextSequentialId('P', [], 4)).toBe('P0001');
  });
});

describe('search', () => {
  it('normalizes niqqud, punctuation, case', () => {
    expect(normalizeSearch('  דָּנָה  כֹּהֵן ')).toBe('דנה כהן');
    expect(normalizeSearch("בן-ג'ו")).toBe('בןגו');
  });
  it('matches all tokens in any order', () => {
    expect(matchesQuery('ישראל ישראלי', 'ישרא')).toBe(true);
    expect(matchesQuery('דנה כהן', 'כהן דנ')).toBe(true);
    expect(matchesQuery('דנה כהן', 'לוי')).toBe(false);
  });
});
