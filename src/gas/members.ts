/**
 * Member lookup used by sales and the client list.
 * Stage 1: members come straight from the external list and are identified by the legacy key.
 */
import type { Member } from '../shared/api';
import { AppError } from '../core/errors';
import { guestKey, memberKey, type ValidSale } from '../core/sales';
import { readExternalMembers } from './external';

export interface SaleMember { last: string; first: string; key: string; inList: boolean }

export function membersForClient(force: boolean): Member[] {
  return readExternalMembers(force).map(e => ({ id: e.externalKey, first: e.first, last: e.last, display: (e.first + ' ' + e.last).trim(), guest: false }));
}

export function resolveSaleMember(v: ValidSale): SaleMember {
  if (v.memberId) {
    const find = (force: boolean) => readExternalMembers(force).find(e => e.externalKey === v.memberId);
    const e = find(false) || find(true);
    if (!e) throw new AppError('NOT_FOUND', 'החבר לא נמצא ברשימה – רענן את הרשימה');
    return { last: e.last, first: e.first, key: memberKey(e.last, e.first), inList: true };
  }
  const g = v.guest!;
  return { last: g.last, first: g.first, key: guestKey(g.last, g.first), inList: false };
}
