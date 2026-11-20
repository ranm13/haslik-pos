/**
 * Money helpers. All amounts in code are integer agorot (1 ₪ = 100 agorot).
 * Floats appear only at the legacy-sheet boundary (toAgorot / toShekels).
 */
export type Agorot = number;

export function isAgorot(n: unknown): n is Agorot {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

/**
 * Parses what a person typed ("12", "12.5", "12.50", "₪ 1,200") into agorot.
 * Returns null for empty, negative, more than 2 decimals, or non-numeric input.
 * Done on the string, never via float multiplication.
 */
export function parseShekelInput(input: string | number | null | undefined): Agorot | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₪,\s]/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return whole * 100 + frac;
}

/** Converts a shekel number read from a legacy sheet cell to agorot (rounds away float noise like 12.3*100). */
export function toAgorot(shekels: number | string): Agorot {
  const n = typeof shekels === 'number' ? shekels : Number(String(shekels).replace(/[₪,\s]/g, ''));
  if (!Number.isFinite(n)) return 0;
  // Shift the decimal point in the string form so 1.005 → "1.005e2" → 100.5 (n*100 would give 100.4999…)
  const s = String(n);
  if (s.includes('e')) return Math.round(n * 100);
  return Math.round(Number(s + 'e2'));
}

/** Converts agorot to a shekel number for writing into a legacy sheet cell. */
export function toShekels(a: Agorot): number {
  return a / 100;
}

/** "₪1,234" for whole shekels, "₪12.30" otherwise. Negative as "-₪5". */
export function formatAgorot(a: Agorot): string {
  const neg = a < 0;
  const abs = Math.abs(a);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeStr = whole.toLocaleString('en-US');
  const body = frac === 0 ? wholeStr : wholeStr + '.' + String(frac).padStart(2, '0');
  return (neg ? '-' : '') + '₪' + body;
}

export function sumAgorot(values: readonly Agorot[]): Agorot {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
