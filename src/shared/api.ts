/**
 * Contract between the page (src/ui) and the server function `api(request)`,
 * called with google.script.run. See docs/API.md.
 */
import type { Agorot } from './money';

export type Role = 'bar' | 'admin';

export type ErrorCode =
  | 'PIN_REQUIRED' | 'RATE_LIMITED' | 'FORBIDDEN'
  | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'BUSY' | 'NOT_CONFIGURED' | 'INTERNAL';

export interface ApiError { code: ErrorCode; message: string }
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface Auth { pin?: string }

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
  version: string;
  period: Period;
  cardTypes: CardType[];
  members: Member[];
  shift: ShiftState;
  todos: Todo[];
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

/** Stage 1 actions. Later stages add theirs here (members sync: stage 2, products: stage 4). */
export interface ActionMap {
  'session.init': { payload: void; result: InitData };
  'members.list': { payload: void; result: Member[] };
  'shift.get': { payload: void; result: ShiftState };
  'sale.create': { payload: SaleInput; result: ShiftState };
  'sale.void': { payload: { saleId: string }; result: ShiftState };
  'expense.list': { payload: void; result: ExpensesState };
  'expense.create': { payload: ExpenseInput; result: ExpensesState };
  'expense.void': { payload: { expenseId: string }; result: ExpensesState };
  'report.refresh': { payload: void; result: { url: string } };
  'todo.list': { payload: void; result: Todo[] };
  'todo.create': { payload: { text: string }; result: Todo[] };
  'todo.update': { payload: { todoId: string; text?: string; done?: boolean }; result: Todo[] };
  'todo.delete': { payload: { todoId: string }; result: Todo[] };
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

/** Actions that require the admin role (admin PIN or the owner's Google account). */
export const ADMIN_ACTIONS: readonly ActionName[] = [
  'expense.list', 'expense.create', 'expense.void', 'report.refresh',
];
