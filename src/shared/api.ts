/**
 * API contract shared by backend (Apps Script) and frontend. See docs/API.md.
 */
import type { Agorot } from './money';

export type Role = 'bar' | 'admin';
export type Env = 'staging' | 'production';

export type ErrorCode =
  | 'DEVICE_REQUIRED' | 'DEVICE_REVOKED' | 'PIN_REQUIRED' | 'RATE_LIMITED' | 'FORBIDDEN'
  | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'BUSY' | 'NOT_CONFIGURED' | 'INTERNAL';

export interface ApiError { code: ErrorCode; message: string }
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface Auth { deviceToken?: string; pin?: string }

export interface ApiRequest<P = unknown> {
  action: ActionName;
  payload?: P;
  auth?: Auth;
  clientTxId?: string;
}

/* ---------- domain DTOs ---------- */

export interface Period { key: string; title: string; start: string /* dd/MM/yyyy HH:mm */ }

export interface CardType { name: string; priceAgorot: Agorot }

export interface Member {
  id: string;          // memberId (stage 2+) — before stage 2 this is the legacy key
  first: string;
  last: string;
  display: string;
  guest: boolean;
}

export interface MemberAdmin extends Member {
  status: 'active' | 'inactive' | 'merged';
  source: 'EXTERNAL' | 'GUEST' | 'MANUAL';
  externalKey: string;
  phone: string;
  mergedInto: string;
}

export interface RecentSale {
  id: string;
  time: string;
  name: string;
  cardType: string;
  qty: number;
  totalAgorot: Agorot;
  note: string;
  inList: boolean;
  voided: boolean;
  canUndo: boolean;
}

export interface ShiftState { date: string; cards: number; amountAgorot: Agorot; recent: RecentSale[] }

export type ExpenseType = 'EXPENSE' | 'CREDIT';

export interface ExpenseItem { id: string; date: string; desc: string; amountAgorot: Agorot; type: ExpenseType }

export interface ExpensesState {
  items: ExpenseItem[];
  expensesAgorot: Agorot;
  creditsAgorot: Agorot;
  netAgorot: Agorot;
  periodTitle: string;
  warning?: string;
}

export interface Todo { id: string; text: string; done: boolean; date: string }

export interface Device { deviceId: string; name: string; active: boolean; createdAt: string; lastSeenAt: string; current: boolean }

export interface Product {
  productId: string;
  name: string;
  category: string;
  priceAgorot: Agorot;
  active: boolean;
  sortOrder: number;
  trackStock: boolean;
  minLevel: number;
  isOpenPrice: boolean;
}
export type ProductInput = Omit<Product, 'productId'> & { productId?: string };

export interface InitData {
  role: Role;
  pubName: string;
  env: Env;
  version: string;
  deviceName: string;
  period: Period;
  cardTypes: CardType[];
  members: Member[];
  shift: ShiftState;
  todos: Todo[];
  products: Product[];
  expenses?: ExpensesState;
  reportUrl?: string;
}

export interface SyncCandidate { externalKey: string; first: string; last: string }
export interface SyncPreview {
  externalCount: number;
  toAdd: SyncCandidate[];
  toDeactivate: { memberId: string; display: string; externalKey: string }[];
  renameSuggestions: { memberId: string; fromKey: string; toKey: string; reason: string }[];
  unchanged: number;
}
export interface SyncResult { added: number; deactivated: number; renamed: number; reactivated: number }

/* ---------- actions ---------- */

export interface ActionMap {
  'ping': { payload: void; result: { env: Env | 'unconfigured'; version: string; now: string } };
  'admin.bootstrap': { payload: BootstrapPayload; result: { configured: true; log: string[] } };
  'device.register': { payload: { name: string }; result: { deviceId: string; deviceToken: string; name: string } };
  'device.list': { payload: void; result: Device[] };
  'device.revoke': { payload: { deviceId: string }; result: Device[] };
  'admin.setPins': { payload: { barPin?: string; adminPin?: string }; result: Record<string, never> };
  'session.init': { payload: void; result: InitData };
  'members.list': { payload: void; result: Member[] };
  'shift.get': { payload: void; result: ShiftState };
  'sale.create': { payload: SaleInput; result: ShiftState };
  'sale.void': { payload: { saleId: string }; result: ShiftState };
  'expense.list': { payload: void; result: ExpensesState };
  'expense.create': { payload: ExpenseInput; result: ExpensesState };
  'expense.void': { payload: { expenseId: string }; result: ExpensesState };
  'expense.backfillType': { payload: void; result: { updated: number } };
  'report.refresh': { payload: void; result: { url: string } };
  'todo.list': { payload: void; result: Todo[] };
  'todo.create': { payload: { text: string }; result: Todo[] };
  'todo.update': { payload: { todoId: string; text?: string; done?: boolean }; result: Todo[] };
  'todo.delete': { payload: { todoId: string }; result: Todo[] };
  'members.adminList': { payload: void; result: MemberAdmin[] };
  'members.syncPreview': { payload: void; result: SyncPreview };
  'members.syncApply': { payload: SyncApplyInput; result: SyncResult };
  'members.update': { payload: { memberId: string; displayName?: string; phone?: string; status?: 'active' | 'inactive' }; result: MemberAdmin[] };
  'members.merge': { payload: { fromId: string; intoId: string }; result: MemberAdmin[] };
  'members.mapLegacy': { payload: void; result: { mapped: number; created: number; total: number } };
  'product.list': { payload: void; result: Product[] };
  'product.upsert': { payload: ProductInput; result: Product[] };
  'product.seedPlaceholder': { payload: void; result: Product[] };
}
export type ActionName = keyof ActionMap;

export interface SaleInput {
  memberId?: string;
  guest?: { first: string; last: string };
  cardType: string;
  qty: number;
  note?: string;
}

export interface ExpenseInput { date: string; desc: string; amountAgorot: Agorot; type?: ExpenseType }

export interface SyncApplyInput {
  add: string[];
  deactivate: string[];
  renames: { memberId: string; externalKey: string }[];
}

export interface BootstrapPayload {
  secret: string;
  env: Env;
  masterId: string;
  barPin: string;
  adminPin: string;
  adminEmail: string;
  financeEmails?: string[];
  members?: { fileId: string; tab: string; lastHeader: string; firstHeader: string };
  seedStaging?: boolean;
}

/** Actions that need no device token / PIN. */
export const PUBLIC_ACTIONS: readonly ActionName[] = ['ping', 'admin.bootstrap', 'device.register'];

/** Actions that require the admin PIN. */
export const ADMIN_ACTIONS: readonly ActionName[] = [
  'device.list', 'device.revoke', 'admin.setPins', 'expense.list', 'expense.create', 'expense.void',
  'expense.backfillType', 'report.refresh', 'members.adminList', 'members.syncPreview', 'members.syncApply',
  'members.update', 'members.merge', 'members.mapLegacy', 'product.upsert', 'product.seedPlaceholder',
];
