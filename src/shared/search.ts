/** Hebrew-friendly search normalization (same rules as the legacy UI). */
export function normalizeSearch(s: string | null | undefined): string {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '') // niqqud / cantillation
    .replace(/['"`׳״\-.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** True if every token of the query appears somewhere in the text. */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return false;
  const full = normalizeSearch(text);
  return q.split(' ').every(t => full.includes(t));
}
