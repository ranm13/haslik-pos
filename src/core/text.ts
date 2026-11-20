/** Collapses whitespace, removes control characters, trims and truncates. */
export function cleanText(s: unknown, maxLen = 120): string {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Forces a sheet cell to text and blocks formula injection (=, +, -, @). */
export function asText(s: unknown): string {
  return "'" + String(s == null ? '' : s);
}

/** Reads a text cell value back: removes a leading apostrophe and trims. */
export function fromText(v: unknown): string {
  return String(v == null ? '' : v).replace(/^'/, '').trim();
}

/** Random id from an injected random source (crypto in browser/Node, Utilities.getUuid in GAS). */
export function randomId(prefix: string, length: number, rand: () => number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = prefix;
  for (let i = 0; i < length; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}

/** Next sequential id: ('M', ['M00001','M00007'], 5) → 'M00008'. Ignores ids with other prefixes. */
export function nextSequentialId(prefix: string, existing: readonly string[], width: number): string {
  let max = 0;
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(width, '0');
}
