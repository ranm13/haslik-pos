/**
 * Members & identity (stage 2). Pure functions: the Apps Script layer reads rows,
 * calls these, and writes back the returned operations.
 */
import type { SyncApplyInput, SyncCandidate, SyncPreview } from '../shared/api';
import { fail, invalid } from './errors';
import { cleanText, nextSequentialId } from './text';
import { guestKey, memberKey } from './sales';

export type MemberStatus = 'active' | 'inactive' | 'merged';
export type MemberSource = 'EXTERNAL' | 'GUEST' | 'MANUAL';

export interface MemberRow {
  memberId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  status: MemberStatus;
  source: MemberSource;
  externalKey: string;
  mergedInto: string;
}

export type MemberOp =
  | { kind: 'add'; row: MemberRow }
  | { kind: 'update'; memberId: string; fields: Partial<MemberRow> };

/* ---------- external list ---------- */

export interface ExternalHeaders { tab: string; last: string; first: string }

/** Parses the external member table (row 0 = headers). Keeps only first/last name. Dedupes by key. */
export function parseExternalTable(values: readonly (readonly unknown[])[], h: ExternalHeaders, compare: (a: string, b: string) => number): SyncCandidate[] {
  if (!values.length) fail('VALIDATION', 'הלשונית "' + h.tab + '" ריקה');
  const headers = (values[0] || []).map(x => String(x).trim());
  const iLast = headers.indexOf(h.last);
  const iFirst = headers.indexOf(h.first);
  if (iLast < 0 || iFirst < 0) {
    fail('VALIDATION', 'בלשונית "' + h.tab + '" לא נמצאו העמודות "' + h.last + '" ו-"' + h.first + '" בשורה הראשונה. נמצאו: ' + headers.filter(Boolean).join(', '));
  }
  const seen = new Set<string>();
  const out: SyncCandidate[] = [];
  for (const r of values.slice(1)) {
    if (!r) continue;
    const last = cleanText(r[iLast], 60);
    const first = cleanText(r[iFirst], 60);
    if (!last && !first) continue;
    const key = memberKey(last, first);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ externalKey: key, last, first });
  }
  return out.sort((a, b) => compare(a.last + ' ' + a.first, b.last + ' ' + b.first));
}

/* ---------- display names ---------- */

export function defaultDisplay(first: string, last: string): string {
  return (first + ' ' + last).trim();
}

/** Returns `name`, or `name (2)`, `name (3)`… so no two active members share a display name (ID3). */
export function uniqueDisplay(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = name + ' (' + i + ')';
    if (!taken.has(candidate)) return candidate;
  }
}

export function activeDisplayNames(members: readonly MemberRow[], exceptId?: string): Set<string> {
  return new Set(members.filter(m => m.status === 'active' && m.memberId !== exceptId).map(m => m.displayName));
}

/* ---------- sync ---------- */

export function syncPreview(external: readonly SyncCandidate[], members: readonly MemberRow[]): SyncPreview {
  const extKeys = new Set(external.map(e => e.externalKey));
  const byKey = new Map(members.filter(m => m.source === 'EXTERNAL').map(m => [m.externalKey, m]));

  const toAdd = external.filter(e => {
    const m = byKey.get(e.externalKey);
    return !m || m.status === 'inactive';
  });
  const toDeactivate = members
    .filter(m => m.source === 'EXTERNAL' && m.status === 'active' && !extKeys.has(m.externalKey))
    .map(m => ({ memberId: m.memberId, display: m.displayName, externalKey: m.externalKey }));

  const renameSuggestions: SyncPreview['renameSuggestions'] = [];
  for (const d of toDeactivate) {
    const [dLast, dFirst] = d.externalKey.split('|');
    for (const a of toAdd) {
      if (byKey.get(a.externalKey)) continue; // reactivation, not a rename
      if (a.last === dLast && a.first !== dFirst) renameSuggestions.push({ memberId: d.memberId, fromKey: d.externalKey, toKey: a.externalKey, reason: 'אותו שם משפחה' });
      else if (a.first === dFirst && a.last !== dLast) renameSuggestions.push({ memberId: d.memberId, fromKey: d.externalKey, toKey: a.externalKey, reason: 'אותו שם פרטי' });
    }
  }
  const unchanged = members.filter(m => m.source === 'EXTERNAL' && m.status === 'active' && extKeys.has(m.externalKey)).length;
  return { externalCount: external.length, toAdd, toDeactivate, renameSuggestions, unchanged };
}

/**
 * Turns an approved sync into operations. Never deletes (ID2); new ids are sequential (ID1).
 * Renames keep the memberId and move it to the new external key.
 */
export function planSync(external: readonly SyncCandidate[], members: readonly MemberRow[], input: SyncApplyInput): { ops: MemberOp[]; added: number; deactivated: number; renamed: number; reactivated: number } {
  const extByKey = new Map(external.map(e => [e.externalKey, e]));
  const byId = new Map(members.map(m => [m.memberId, m]));
  const byKey = new Map(members.filter(m => m.source === 'EXTERNAL').map(m => [m.externalKey, m]));
  const ids = members.map(m => m.memberId);
  const taken = activeDisplayNames(members);
  const ops: MemberOp[] = [];
  const consumedKeys = new Set<string>();
  let added = 0, deactivated = 0, renamed = 0, reactivated = 0;

  for (const r of input.renames || []) {
    const m = byId.get(r.memberId);
    const e = extByKey.get(r.externalKey);
    if (!m || !e) invalid('שינוי שם לא תקין: ' + r.memberId);
    const mm = m as MemberRow, ee = e as SyncCandidate;
    if (byKey.get(ee.externalKey)) invalid('המפתח ' + ee.externalKey + ' כבר שייך לחבר אחר');
    taken.delete(mm.displayName);
    const display = uniqueDisplay(defaultDisplay(ee.first, ee.last), taken);
    taken.add(display);
    ops.push({ kind: 'update', memberId: mm.memberId, fields: { firstName: ee.first, lastName: ee.last, externalKey: ee.externalKey, displayName: display, status: 'active' } });
    consumedKeys.add(ee.externalKey);
    renamed++;
  }
  const renamedIds = new Set((input.renames || []).map(r => r.memberId));

  for (const key of input.add || []) {
    if (consumedKeys.has(key)) continue;
    const e = extByKey.get(key);
    if (!e) invalid('החבר ' + key + ' לא נמצא ברשימה החיצונית');
    const ee = e as SyncCandidate;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.status === 'inactive') {
        const display = uniqueDisplay(existing.displayName, taken);
        taken.add(display);
        ops.push({ kind: 'update', memberId: existing.memberId, fields: { status: 'active', displayName: display } });
        reactivated++;
      }
      continue;
    }
    const memberId = nextSequentialId('M', ids, 5);
    ids.push(memberId);
    const display = uniqueDisplay(defaultDisplay(ee.first, ee.last), taken);
    taken.add(display);
    ops.push({ kind: 'add', row: { memberId, firstName: ee.first, lastName: ee.last, displayName: display, phone: '', status: 'active', source: 'EXTERNAL', externalKey: key, mergedInto: '' } });
    added++;
  }

  for (const id of input.deactivate || []) {
    if (renamedIds.has(id)) continue;
    const m = byId.get(id);
    if (!m) invalid('החבר ' + id + ' לא נמצא');
    if ((m as MemberRow).status !== 'active') continue;
    ops.push({ kind: 'update', memberId: id, fields: { status: 'inactive' } });
    deactivated++;
  }
  return { ops, added, deactivated, renamed, reactivated };
}

/** Applies ops to an in-memory list (used by tests and by the GAS layer to compute the post-state). */
export function applyOps(members: readonly MemberRow[], ops: readonly MemberOp[]): MemberRow[] {
  const out = members.map(m => ({ ...m }));
  const idx = new Map(out.map((m, i) => [m.memberId, i]));
  for (const op of ops) {
    if (op.kind === 'add') { idx.set(op.row.memberId, out.length); out.push({ ...op.row }); }
    else {
      const i = idx.get(op.memberId);
      if (i !== undefined) out[i] = { ...out[i], ...op.fields };
    }
  }
  return out;
}

/* ---------- guests ---------- */

/** Finds or plans a GUEST member for a free-text name. */
export function planGuest(members: readonly MemberRow[], first: string, last: string): { member: MemberRow; op?: MemberOp } {
  const key = guestKey(last, first);
  const existing = members.find(m => m.source === 'GUEST' && m.externalKey === key);
  if (existing) return { member: resolveMember(existing.memberId, members) };
  const memberId = nextSequentialId('M', members.map(m => m.memberId), 5);
  const display = uniqueDisplay(defaultDisplay(first, last) + ' (אורח)', activeDisplayNames(members));
  const row: MemberRow = { memberId, firstName: first, lastName: last, displayName: display, phone: '', status: 'active', source: 'GUEST', externalKey: key, mergedInto: '' };
  return { member: row, op: { kind: 'add', row } };
}

/* ---------- merge & resolution ---------- */

/** Follows mergedInto chains (A→B→C gives C). Stops on cycles (ID5). */
export function resolveMember(memberId: string, members: readonly MemberRow[]): MemberRow {
  const byId = new Map(members.map(m => [m.memberId, m]));
  let m = byId.get(memberId);
  if (!m) fail('NOT_FOUND', 'החבר לא נמצא');
  const seen = new Set<string>();
  let cur = m as MemberRow;
  while (cur.status === 'merged' && cur.mergedInto && !seen.has(cur.memberId)) {
    seen.add(cur.memberId);
    const next = byId.get(cur.mergedInto);
    if (!next) break;
    cur = next;
  }
  return cur;
}

export function planMerge(members: readonly MemberRow[], fromId: string, intoId: string): MemberOp[] {
  if (fromId === intoId) invalid('אי אפשר למזג חבר לעצמו');
  const byId = new Map(members.map(m => [m.memberId, m]));
  const from = byId.get(fromId), into = byId.get(intoId);
  if (!from || !into) fail('NOT_FOUND', 'החבר לא נמצא');
  const target = resolveMember(intoId, members);
  if (target.memberId === fromId) invalid('מיזוג ייצור מעגל');
  if (target.status !== 'active') invalid('אפשר למזג רק לחבר פעיל');
  return [{ kind: 'update', memberId: fromId, fields: { status: 'merged', mergedInto: target.memberId } }];
}

/* ---------- legacy key mapping (ID4) ---------- */

/**
 * For every legacy key seen in the sales log, find the member or plan a new one.
 * `last|first` not in Members → EXTERNAL, inactive (left the list). `guest|…` → GUEST, active.
 */
export function planLegacyMapping(saleKeys: readonly string[], members: readonly MemberRow[], existingMap: ReadonlyMap<string, string>): { ops: MemberOp[]; mappings: { legacyKey: string; memberId: string }[] } {
  const all = members.slice();
  const ops: MemberOp[] = [];
  const mappings: { legacyKey: string; memberId: string }[] = [];
  const byKey = new Map(all.map(m => [m.externalKey, m]));
  for (const key of [...new Set(saleKeys)]) {
    if (!key || existingMap.has(key)) continue;
    let m = byKey.get(key);
    if (!m) {
      const guest = key.startsWith('guest|');
      const parts = key.split('|');
      const last = guest ? parts[1] || '' : parts[0] || '';
      const first = guest ? parts[2] || '' : parts[1] || '';
      const memberId = nextSequentialId('M', all.map(x => x.memberId), 5);
      const base = defaultDisplay(first, last) + (guest ? ' (אורח)' : '');
      const display = guest ? uniqueDisplay(base, activeDisplayNames(all)) : base;
      m = { memberId, firstName: first, lastName: last, displayName: display, phone: '', status: guest ? 'active' : 'inactive', source: guest ? 'GUEST' : 'EXTERNAL', externalKey: key, mergedInto: '' };
      all.push(m);
      byKey.set(key, m);
      ops.push({ kind: 'add', row: m });
    }
    mappings.push({ legacyKey: key, memberId: m.memberId });
  }
  return { ops, mappings };
}
