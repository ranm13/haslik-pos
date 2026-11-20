import type { Product, ProductInput } from '../shared/api';
import { isAgorot } from '../shared/money';
import { fail, invalid } from './errors';
import { cleanText, nextSequentialId } from './text';

export const MAX_PRICE_AGOROT = 100_000; // ₪1,000 per item is plenty for a bar

/** Validates input and returns the full product (new id when creating). PR1, PR2. */
export function planUpsert(products: readonly Product[], input: ProductInput | undefined): { product: Product; isNew: boolean } {
  if (!input) invalid('בקשה לא תקינה');
  const p = input as ProductInput;
  const name = cleanText(p.name, 60);
  if (!name) invalid('יש להזין שם מוצר');
  const category = cleanText(p.category, 40) || 'כללי';
  const isOpenPrice = p.isOpenPrice === true;
  const price = p.priceAgorot;
  if (!isAgorot(price) || price < 0 || price > MAX_PRICE_AGOROT) invalid('מחיר לא תקין');
  if (price === 0 && !isOpenPrice) invalid('מחיר 0 מותר רק ל"פריט חופשי"');
  const sortOrder = Number.isInteger(p.sortOrder) ? p.sortOrder : 0;
  const minLevel = Number.isInteger(p.minLevel) && p.minLevel >= 0 ? p.minLevel : 0;
  const active = p.active !== false;

  const existing = p.productId ? products.find(x => x.productId === p.productId) : undefined;
  if (p.productId && !existing) fail('NOT_FOUND', 'המוצר לא נמצא');

  if (active) {
    const clash = products.find(x => x.active && x.productId !== p.productId && x.name.trim() === name);
    if (clash) invalid('כבר קיים מוצר פעיל בשם "' + name + '"');
  }

  const product: Product = {
    productId: existing ? existing.productId : nextSequentialId('P', products.map(x => x.productId), 4),
    name, category, priceAgorot: price, active, sortOrder,
    trackStock: p.trackStock === true, minLevel, isOpenPrice,
  };
  return { product, isNew: !existing };
}

/** Order used by the POS grid and the admin screen. */
export function sortProducts(list: readonly Product[], compare: (a: string, b: string) => number): Product[] {
  return list.slice().sort((a, b) =>
    compare(a.category, b.category) || a.sortOrder - b.sortOrder || compare(a.name, b.name));
}

/** Placeholder catalog for staging (D15). Prices are examples only. */
export const PLACEHOLDER_CATALOG: readonly ProductInput[] = [
  { name: 'בירה מהחבית – שליש', category: 'בירה', priceAgorot: 1800, active: true, sortOrder: 1, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'בירה מהחבית – חצי', category: 'בירה', priceAgorot: 2400, active: true, sortOrder: 2, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'בירה בבקבוק', category: 'בירה', priceAgorot: 2000, active: true, sortOrder: 3, trackStock: true, minLevel: 24, isOpenPrice: false },
  { name: 'כוס יין', category: 'יין ואלכוהול', priceAgorot: 2500, active: true, sortOrder: 1, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'צ\'ייסר', category: 'יין ואלכוהול', priceAgorot: 1500, active: true, sortOrder: 2, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'קוקטייל', category: 'יין ואלכוהול', priceAgorot: 3200, active: true, sortOrder: 3, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'שתייה קלה', category: 'שתייה קלה', priceAgorot: 800, active: true, sortOrder: 1, trackStock: true, minLevel: 24, isOpenPrice: false },
  { name: 'מים מינרליים', category: 'שתייה קלה', priceAgorot: 500, active: true, sortOrder: 2, trackStock: true, minLevel: 12, isOpenPrice: false },
  { name: 'קפה', category: 'שתייה קלה', priceAgorot: 700, active: true, sortOrder: 3, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'במבה / ביסלי', category: 'נשנושים', priceAgorot: 600, active: true, sortOrder: 1, trackStock: true, minLevel: 10, isOpenPrice: false },
  { name: 'צלחת נשנושים', category: 'נשנושים', priceAgorot: 2500, active: true, sortOrder: 2, trackStock: false, minLevel: 0, isOpenPrice: false },
  { name: 'פריט חופשי', category: 'אחר', priceAgorot: 0, active: true, sortOrder: 99, trackStock: false, minLevel: 0, isOpenPrice: true },
];
