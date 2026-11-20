/** Handlers added after stage 1 (members, products). Each stage adds its actions here. */
import type { InitData } from '../shared/api';
import type { Ctx } from './auth';
import type { Handlers } from './router';

export const extraHandlers: Handlers = {};

export function initExtras(_ctx: Ctx): Partial<InitData> {
  return {};
}
