import { describe, expect, it } from 'vitest';
import {
  applyOps, parseExternalTable, planGuest, planLegacyMapping, planMerge, planSync,
  resolveMember, syncPreview, uniqueDisplay, type MemberRow,
} from '../src/core/members';
import { he } from './helpers';

const m = (o: Partial<MemberRow>): MemberRow => ({
  memberId: 'M00001', firstName: 'ישראל', lastName: 'ישראלי', displayName: 'ישראל ישראלי', phone: '',
  status: 'active', source: 'EXTERNAL', externalKey: 'ישראלי|ישראל', mergedInto: '', ...o,
});
const h = { tab: 'עדכני', last: 'שם משפחה', first: 'שם פרטי' };

describe('external table', () => {
  it('keeps only names, dedupes, sorts', () => {
    const list = parseExternalTable([
      ['ת"ז', 'שם משפחה', 'שם פרטי'],
      ['1', 'כהן', 'דנה'],
      ['2', 'ישראלי', 'ישראל'],
      ['3', 'כהן', 'דנה'],
      ['4', '', ''],
    ], h, he);
    expect(list).toEqual([
      { externalKey: 'ישראלי|ישראל', last: 'ישראלי', first: 'ישראל' },
      { externalKey: 'כהן|דנה', last: 'כהן', first: 'דנה' },
    ]);
  });
  it('explains missing headers', () => {
    expect(() => parseExternalTable([['a', 'b']], h, he)).toThrow('לא נמצאו העמודות');
  });
});

describe('ID3 display names', () => {
  it('suffixes duplicates', () => {
    expect(uniqueDisplay('דנה כהן', new Set(['דנה כהן', 'דנה כהן (2)']))).toBe('דנה כהן (3)');
  });
});

describe('ID1/ID2 sync', () => {
  const external = [
    { externalKey: 'ישראלי|ישראל', last: 'ישראלי', first: 'ישראל' },
    { externalKey: 'כהן|דנה', last: 'כהן', first: 'דנה' },
    { externalKey: 'לוי-כהן|רות', last: 'לוי-כהן', first: 'רות' },
  ];
  const members = [
    m({}),
    m({ memberId: 'M00002', firstName: 'רות', lastName: 'לוי', displayName: 'רות לוי', externalKey: 'לוי|רות' }),
    m({ memberId: 'M00003', firstName: 'אבי', lastName: 'גל', displayName: 'אבי גל', externalKey: 'גל|אבי' }),
  ];
  it('previews adds, deactivations and rename suggestions', () => {
    const p = syncPreview(external, members);
    expect(p.toAdd.map(a => a.externalKey)).toEqual(['כהן|דנה', 'לוי-כהן|רות']);
    expect(p.toDeactivate.map(d => d.memberId)).toEqual(['M00002', 'M00003']);
    expect(p.renameSuggestions).toEqual([{ memberId: 'M00002', fromKey: 'לוי|רות', toKey: 'לוי-כהן|רות', reason: 'אותו שם פרטי' }]);
    expect(p.unchanged).toBe(1);
  });
  it('applies: rename keeps id, new ids are sequential, nothing deleted', () => {
    const plan = planSync(external, members, {
      add: ['כהן|דנה', 'לוי-כהן|רות'],
      deactivate: ['M00002', 'M00003'],
      renames: [{ memberId: 'M00002', externalKey: 'לוי-כהן|רות' }],
    });
    expect(plan).toMatchObject({ added: 1, renamed: 1, deactivated: 1, reactivated: 0 });
    const after = applyOps(members, plan.ops);
    expect(after).toHaveLength(4);
    expect(after.find(x => x.memberId === 'M00002')).toMatchObject({ externalKey: 'לוי-כהן|רות', status: 'active', displayName: 'רות לוי-כהן' });
    expect(after.find(x => x.memberId === 'M00003')?.status).toBe('inactive');
    expect(after.find(x => x.memberId === 'M00004')?.externalKey).toBe('כהן|דנה');
  });
  it('reactivates a member who came back', () => {
    const inactive = [m({ status: 'inactive' })];
    const plan = planSync(external, inactive, { add: ['ישראלי|ישראל'], deactivate: [], renames: [] });
    expect(plan.reactivated).toBe(1);
    expect(plan.added).toBe(0);
  });
  it('never reuses an id after inactivation', () => {
    const list = [m({ memberId: 'M00009', status: 'inactive' })];
    const plan = planSync([{ externalKey: 'a|b', last: 'a', first: 'b' }], list, { add: ['a|b'], deactivate: [], renames: [] });
    expect((plan.ops[0] as { row: MemberRow }).row.memberId).toBe('M00010');
  });
});

describe('guests', () => {
  it('reuses an existing guest, else plans one with a distinct display name', () => {
    const existing = m({ memberId: 'M00005', source: 'GUEST', externalKey: 'guest|כהן|דנה', displayName: 'דנה כהן (אורח)' });
    expect(planGuest([existing], 'דנה', 'כהן').op).toBeUndefined();
    const fresh = planGuest([m({})], 'ישראל', 'ישראלי');
    expect(fresh.member).toMatchObject({ memberId: 'M00002', source: 'GUEST', displayName: 'ישראל ישראלי (אורח)' });
  });
});

describe('ID5 merge', () => {
  const list = [
    m({ memberId: 'A', status: 'merged', mergedInto: 'B' }),
    m({ memberId: 'B', status: 'merged', mergedInto: 'C' }),
    m({ memberId: 'C' }),
  ];
  it('follows chains', () => {
    expect(resolveMember('A', list).memberId).toBe('C');
  });
  it('stops on cycles', () => {
    const cyc = [m({ memberId: 'X', status: 'merged', mergedInto: 'Y' }), m({ memberId: 'Y', status: 'merged', mergedInto: 'X' })];
    expect(['X', 'Y']).toContain(resolveMember('X', cyc).memberId);
  });
  it('merges into the resolved target and refuses self/cycles', () => {
    expect(planMerge(list, 'A', 'B')).toEqual([{ kind: 'update', memberId: 'A', fields: { status: 'merged', mergedInto: 'C' } }]);
    expect(() => planMerge(list, 'C', 'C')).toThrow();
    expect(() => planMerge(list, 'C', 'A')).toThrow('מעגל');
  });
});

describe('ID4 legacy mapping', () => {
  it('maps every key exactly once and creates missing members', () => {
    const members = [m({})];
    const { ops, mappings } = planLegacyMapping(
      ['ישראלי|ישראל', 'guest|כהן|דנה', 'עזב|יוסי', 'ישראלי|ישראל', 'מופה|כבר'],
      members,
      new Map([['מופה|כבר', 'M00099']]),
    );
    expect(mappings).toEqual([
      { legacyKey: 'ישראלי|ישראל', memberId: 'M00001' },
      { legacyKey: 'guest|כהן|דנה', memberId: 'M00002' },
      { legacyKey: 'עזב|יוסי', memberId: 'M00003' },
    ]);
    const after = applyOps(members, ops);
    expect(after.find(x => x.memberId === 'M00002')).toMatchObject({ source: 'GUEST', status: 'active' });
    expect(after.find(x => x.memberId === 'M00003')).toMatchObject({ source: 'EXTERNAL', status: 'inactive', firstName: 'יוסי', lastName: 'עזב' });
  });
});
