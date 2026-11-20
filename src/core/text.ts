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

/** Drive file id from a Drive/Sheets link (…/d/<id>/… or ?id=<id>) or a bare id; '' if none. */
export function fileIdFromUrl(url: unknown): string {
  const s = String(url == null ? '' : url).trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  // a bare id: real Drive ids are 25+ chars mixing lowercase and digits (rejects placeholders like PASTE_..._HERE)
  return /^[a-zA-Z0-9_-]{25,}$/.test(s) && /[a-z]/.test(s) && /\d/.test(s) ? s : '';
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
