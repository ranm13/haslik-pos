import { describe, expect, it } from 'vitest';
import { hashSecret, isLocked, MAX_PIN_FAILS, roleForPin, safeEqual, validatePinFormat, validatePinPair } from '../src/core/auth';
import { sha } from './helpers';

const salt = 'salt123';
const hashes = { salt, bar: hashSecret(sha, salt, '2468'), admin: hashSecret(sha, salt, '13579') };

describe('A1 PIN hashing', () => {
  it('stores no plain text and depends on the salt', () => {
    expect(hashes.bar).not.toContain('2468');
    expect(hashSecret(sha, 'other', '2468')).not.toBe(hashes.bar);
  });
  it('maps PINs to roles', () => {
    expect(roleForPin(sha, hashes, '2468')).toBe('bar');
    expect(roleForPin(sha, hashes, ' 13579 ')).toBe('admin');
    expect(roleForPin(sha, hashes, '0000')).toBeNull();
    expect(roleForPin(sha, hashes, '')).toBeNull();
  });
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('A3 lockout', () => {
  it('locks at the limit', () => {
    expect(isLocked(MAX_PIN_FAILS - 1)).toBe(false);
    expect(isLocked(MAX_PIN_FAILS)).toBe(true);
  });
});

describe('PIN format', () => {
  it('requires 4–10 digits, distinct bar/admin', () => {
    expect(validatePinFormat(' 1234 ', 'x')).toBe('1234');
    expect(() => validatePinFormat('123', 'x')).toThrow();
    expect(() => validatePinFormat('12a4', 'x')).toThrow();
    expect(() => validatePinPair('1234', '1234')).toThrow();
  });
});
