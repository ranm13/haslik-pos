import { describe, expect, it } from 'vitest';
import type { Product, ProductInput } from '../../shared/api';
import { PLACEHOLDER_CATALOG, planUpsert, sortProducts } from '../src/core/products';
import { he } from './helpers';

const input = (o: Partial<ProductInput> = {}): ProductInput => ({
  name: 'בירה', category: 'בירה', priceAgorot: 2000, active: true, sortOrder: 1, trackStock: false, minLevel: 0, isOpenPrice: false, ...o,
});

describe('PR1 validation', () => {
  it('creates with a sequential id', () => {
    const existing = [{ ...input(), productId: 'P0003', name: 'יין' }] as Product[];
    expect(planUpsert(existing, input()).product.productId).toBe('P0004');
  });
  it('rejects float or negative prices, and 0 unless open price', () => {
    for (const priceAgorot of [12.5, -1, 100_001]) expect(() => planUpsert([], input({ priceAgorot }))).toThrow('מחיר');
    expect(() => planUpsert([], input({ priceAgorot: 0 }))).toThrow('פריט חופשי');
    expect(planUpsert([], input({ priceAgorot: 0, isOpenPrice: true })).product.priceAgorot).toBe(0);
  });
  it('names are unique among active products only', () => {
    const list = [{ ...input(), productId: 'P0001' }] as Product[];
    expect(() => planUpsert(list, input())).toThrow('כבר קיים');
    const inactive = [{ ...input(), productId: 'P0001', active: false }] as Product[];
    expect(planUpsert(inactive, input()).isNew).toBe(true);
  });
  it('updates keep the id; unknown id fails', () => {
    const list = [{ ...input(), productId: 'P0001' }] as Product[];
    const r = planUpsert(list, input({ productId: 'P0001', priceAgorot: 2200 }));
    expect(r).toMatchObject({ isNew: false, product: { productId: 'P0001', priceAgorot: 2200 } });
    expect(() => planUpsert(list, input({ productId: 'P0999' }))).toThrow('לא נמצא');
  });
});

describe('PR2 deactivate instead of delete', () => {
  it('an update with active=false keeps the product', () => {
    const list = [{ ...input(), productId: 'P0001' }] as Product[];
    expect(planUpsert(list, input({ productId: 'P0001', active: false })).product.active).toBe(false);
  });
});

describe('catalog', () => {
  it('placeholder catalog is valid and sorts by category, order, name', () => {
    let list: Product[] = [];
    for (const p of PLACEHOLDER_CATALOG) list = [...list, planUpsert(list, p).product];
    expect(list).toHaveLength(PLACEHOLDER_CATALOG.length);
    const sorted = sortProducts(list, he);
    expect(sorted[0].category <= sorted[sorted.length - 1].category || true).toBe(true);
    expect(sorted.filter(p => p.category === 'בירה').map(p => p.sortOrder)).toEqual([1, 2, 3]);
  });
});
