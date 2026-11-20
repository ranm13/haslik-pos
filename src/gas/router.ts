import { ADMIN_ACTIONS, type ActionMap, type ActionName, type ApiRequest, type ApiResponse, type InitData } from '../shared/api';
import { AppError } from '../core/errors';
import { audit } from './audit';
import { authenticate, type Ctx } from './auth';
import { currentEnv, PUB_NAME, VERSION } from './config';
import { createExpense, getExpensesState, voidExpense } from './expenses';
import { membersForClient } from './members';
import { periodDto, requireOpenPeriod } from './periods';
import { buildReport } from './report';
import { createSale, getCardTypes, getShiftState, voidSale } from './sales';
import { createTodo, deleteTodo, getTodos, updateTodo } from './todos';
import { extraHandlers, initExtras } from './handlers-ext';

type Handler<A extends ActionName> = (ctx: Ctx, payload: ActionMap[A]['payload'], req: ApiRequest) => ActionMap[A]['result'];
export type Handlers = { [A in ActionName]?: Handler<A> };

const handlers: Handlers = {
  'session.init': ctx => {
    const p = requireOpenPeriod();
    const data: InitData = {
      role: ctx.role,
      pubName: PUB_NAME,
      env: currentEnv(),
      version: VERSION,
      period: periodDto(p),
      cardTypes: getCardTypes(false).map(({ name, priceAgorot }) => ({ name, priceAgorot })),
      members: membersForClient(false),
      shift: getShiftState(ctx.role),
      todos: getTodos(),
      ...initExtras(ctx),
    };
    if (ctx.role === 'admin') {
      data.expenses = getExpensesState();
      data.reportUrl = p.reportUrl;
    }
    return data;
  },
  'members.list': () => membersForClient(true),
  'shift.get': ctx => getShiftState(ctx.role),
  'sale.create': (ctx, p) => createSale(ctx, p),
  'sale.void': (ctx, p) => voidSale(ctx, p?.saleId),
  'expense.list': () => getExpensesState(),
  'expense.create': (ctx, p) => createExpense(ctx, p),
  'expense.void': (ctx, p) => voidExpense(ctx, p?.expenseId),
  'report.refresh': ctx => {
    buildReport(requireOpenPeriod(), false);
    audit('report.refresh', ctx, ctx.clientTxId, null);
    return { url: requireOpenPeriod().reportUrl };
  },
  'todo.list': () => getTodos(),
  'todo.create': (ctx, p) => createTodo(ctx, p?.text),
  'todo.update': (ctx, p) => updateTodo(ctx, p),
  'todo.delete': (ctx, p) => deleteTodo(ctx, p?.todoId),
  ...extraHandlers,
};

/**
 * The only server function the page calls: google.script.run.api({action, payload, auth, clientTxId}).
 * Never throws – errors come back as {ok:false, error:{code, message}} with a Hebrew message.
 */
export function api(req: ApiRequest): ApiResponse<unknown> {
  try {
    const action = req?.action;
    const h = handlers[action] as Handler<ActionName> | undefined;
    if (!h) throw new AppError('VALIDATION', 'פעולה לא מוכרת: ' + String(action));
    const ctx = authenticate(req);
    if (ADMIN_ACTIONS.includes(action) && ctx.role !== 'admin') throw new AppError('FORBIDDEN', 'אין הרשאה – למנהל בלבד');
    return { ok: true, data: h(ctx, req.payload as never, req) };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message } };
    console.error(e && (e as Error).stack ? (e as Error).stack : e);
    const msg = String((e as Error)?.message || e).replace(/^Exception:\s*/, '');
    return { ok: false, error: { code: 'INTERNAL', message: 'שגיאה בשרת: ' + msg } };
  }
}

/** Serves the app page (dist/Index.html, built from src/ui/Index.html). */
export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('הסליק – קופה')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
}
